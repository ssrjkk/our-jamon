const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createSystem } = require('./helpers.cjs');

// Оливки GORDAL 300 г = 450 ₽ из прайса 0711.
const pack = { productId: 'nf-00000229', kind: 'pack', qty: 1 };

async function withSystem(action, options) {
  const system = createSystem(options);
  try { await action(system); } finally { system.cleanup(); }
}

test('POST /api/cart: битое тело и неполная форма — 400, расчёт — 200 no-store', () => withSystem(async s => {
  const { POST } = s.load('app/api/cart/route.ts');
  const badJson = await POST({ json: async () => { throw new Error('bad json'); } });
  assert.equal(badJson.status, 400);
  assert.ok(badJson.body.error);
  assert.equal((await POST(s.request({}))).status, 400);
  assert.equal((await POST(s.request({ items: [pack] }))).status, 400);
  assert.equal((await POST(s.request({ deliveryId: 'pickup' }))).status, 400);
  const ok = await POST(s.request({ items: [pack], deliveryId: 'pickup' }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal(ok.body.quote.itemsSum, 450);
  assert.equal(ok.body.quote.delivery.cost, 0);
}));

test('POST /api/cart: неизвестный товар — 409 с причиной, а не молчаливая замена', () => withSystem(async s => {
  const { POST } = s.load('app/api/cart/route.ts');
  const res = await POST(s.request({ items: [{ productId: 'missing', kind: 'pack', qty: 1 }], deliveryId: 'pickup' }));
  assert.equal(res.status, 409);
  assert.ok(res.body.error);
}));

test('POST /api/cart: живой режим без 1С считает по прайсу 0711, а не отдаёт 503', () => withSystem(async s => {
  const { POST } = s.load('app/api/cart/route.ts');
  const { PRODUCTS } = s.load('lib/products.ts');
  const res = await POST(s.request({ items: [pack], deliveryId: 'pickup' }));
  assert.equal(res.status, 200, 'витрина без 1С не должна отказывать покупателю');
  assert.equal(res.body.quote.itemsSum, PRODUCTS.find((product) => product.id === pack.productId).packs[0].price);
}, { env: { SHOP_MODE: 'live' } }));

test('GET /api/products: демо-каталог, резервы кусков видны, no-store', () => withSystem(async s => {
  const { GET } = s.load('app/api/products/route.ts');
  const empty = await GET();
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get('cache-control'), 'no-store');
  assert.equal(empty.body.demo, true);
  assert.ok(empty.body.products.length > 100);
  assert.deepEqual(empty.body.reservedPieceIds, []);
  const { saveOrder, updateOrder } = s.load('lib/orders.ts');
  const now = new Date().toISOString();
  await saveOrder({
    id: 'NH-ROUTE-A', accessToken: crypto.randomBytes(16).toString('hex'), createdAt: now, consentedAt: now, demo: true,
    customer: { name: 'Test customer', phone: '+79991234567' },
    delivery: { id: 'pickup', name: 'Самовывоз', cost: 0 }, messenger: 'SMS',
    items: [{ uid: 'it-1', productId: 'nf-00000213', title: 'Хамон, кусок без кости, 16 мес.', label: 'кусок ~230 г', price: 1553, weightG: 230, requiresWeightCheck: true, pieceId1c: 'nf-00000213-230', qty: 1 }],
    itemsSum: 1553, total: 1553, status: 'awaiting_payment',
  });
  assert.deepEqual((await GET()).body.reservedPieceIds, ['nf-00000213-230']);
  await updateOrder('NH-ROUTE-A', { status: 'cancelled' });
  assert.deepEqual((await GET()).body.reservedPieceIds, []);
}));

test('GET /api/products: живой режим без 1С отдаёт прайс 0711 и не объясняет причину публично', () => withSystem(async s => {
  const { GET } = s.load('app/api/products/route.ts');
  const { PRODUCTS } = s.load('lib/products.ts');
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal(res.body.demo, false);
  assert.equal(res.body.products.length, PRODUCTS.length);
  assert.equal(res.body.catalog, undefined, 'причина отката каталога — внутренность лавки, а не публичный ответ');
}, { env: { SHOP_MODE: 'live' } }));

test('GET /api/orders: админ видит, чем именно наполнен каталог', () => withSystem(async s => {
  process.env.ADMIN_PASSWORD = 'test-only-admin-passphrase';
  const orders = s.load('app/api/orders/route.ts');
  const login = s.load('app/api/admin/login/route.ts');
  s.applyCookies(await login.POST(s.request({ password: 'test-only-admin-passphrase' })));
  assert.equal((await orders.GET()).body.catalog, null, 'в демо никаких проблем с 1С выдумывать нельзя');

  process.env.SHOP_MODE = 'live';
  const products = s.load('lib/products.ts');
  await products.loadCatalog();
  const health = (await orders.GET()).body.catalog;
  assert.equal(health.origin, 'built-in');
  assert.match(health.notice, /ONEC_API_URL/, 'админу не показали, почему цены не из 1С');
  assert.ok(Date.parse(health.checkedAt) > 0, 'время проверки каталога не показано');
}));

// Действия админки и страницы заказа — кнопки, которые покупатель и продавец видят
// после сбоя. До этого блока ни одна ветка PATCH с 'sync-onec', 'cancel' и
// 'retry-payment' не выполнялась: роутер мог вернуть ok и ничего не записать, и
// администратор видел бы кнопку, которая никогда не гаснет.
const ADMIN_PASSPHRASE = 'test-only-admin-passphrase';

async function asAdmin(s) {
  process.env.ADMIN_PASSWORD = ADMIN_PASSPHRASE;
  s.applyCookies(await s.load('app/api/admin/login/route.ts').POST(s.request({ password: ADMIN_PASSPHRASE })));
}

function routeOrder(fields) {
  const now = new Date().toISOString();
  return {
    id: 'NH-ROUTE-1', accessToken: crypto.randomBytes(16).toString('hex'), createdAt: now, consentedAt: now, demo: false,
    customer: { name: 'Test customer', phone: '+79991234567' },
    delivery: { id: 'pickup', name: 'Самовывоз', cost: 0 }, messenger: 'SMS',
    items: [{ uid: 'it-1', productId: pack.productId, title: 'Оливки GORDAL 300 г', label: '300 г', price: 450, weightG: 300, pricePerKg: null, requiresWeightCheck: false, weightConfirmed: true, pieceId1c: null, qty: 1 }],
    itemsSum: 450, total: 450, status: 'awaiting_payment', paymentId: '123456', paymentUrl: 'https://payment.example.test/session',
    ...fields,
  };
}

const LIVE_ENV = { SHOP_MODE: 'live', SHOP_URL: 'https://shop.example.test', ONEC_API_URL: 'https://catalog.example.test', TBANK_TERMINAL_KEY: 'test-terminal', TBANK_PASSWORD: 'test-only-bank-passphrase', TBANK_TAXATION: 'usn_income', TBANK_VAT: 'none' };

test('PATCH sync-onec: повтор выгрузки пишет время и снимает ошибку 1С', () => withSystem(async s => {
  Object.assign(process.env, LIVE_ENV);
  await asAdmin(s);
  const { saveOrder, getOrder } = s.load('lib/orders.ts');
  const order = routeOrder({ onecSyncError: 'one_c_http_503' });
  await saveOrder(order);

  const pushes = [];
  global.fetch = async (url, options = {}) => {
    if (url === process.env.ONEC_API_URL + '/orders') { pushes.push(JSON.parse(options.body)); return { ok: true, status: 200 }; }
    throw new Error('Unexpected external endpoint: ' + url);
  };
  const { PATCH } = s.load('app/api/orders/[id]/route.ts');
  const patch = (body, id = order.id) => PATCH(s.request(body, `${process.env.SHOP_URL}/api/orders/${id}`), { params: Promise.resolve({ id }) });

  const res = await patch({ action: 'sync-onec' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(pushes.length, 1, 'кнопка не обратилась к 1С');
  assert.deepEqual(Object.keys(pushes[0]).sort(), ['createdAt', 'customer', 'delivery', 'id', 'items', 'itemsSum', 'paymentId', 'status', 'total'].sort(), 'в 1С уехало не то набор полей');
  assert.equal(pushes[0].id, order.id);
  assert.equal(pushes[0].total, 450);
  assert.equal(pushes[0].status, 'awaiting_payment');
  let saved = await getOrder(order.id);
  assert.equal(saved.onecSyncError, undefined, 'ошибка выгрузки осталась записанной после успешного повтора');
  assert.ok(Date.parse(saved.onecSyncedAt ?? '') > 0, 'время синхронизации не записано — кнопка не погаснет');

  // 1С снова молчит: ok обязан стать false, а причина — появиться в заказе.
  global.fetch = async () => ({ ok: false, status: 503 });
  const failed = await patch({ action: 'sync-onec' });
  assert.equal(failed.body.ok, false, 'сбой выгрузки спрятан за удачным ответом');
  saved = await getOrder(order.id);
  assert.equal(saved.onecSyncError, 'one_c_http_503');
  assert.equal(saved.onecSyncedAt, undefined, 'заказ помечен выгруженным, хотя 1С ответила 503');

  // Границы того же контрола: без авторизации — 401 и ни одного запроса в 1С,
  // неизвестное действие и его отсутствие — 400, чужой id — 404.
  s.jar.clear();
  assert.equal((await patch({ action: 'sync-onec' })).status, 401);
  assert.equal(pushes.length, 1, 'sync-onec выгрузил заказ без авторизации администратора');
  await asAdmin(s);
  assert.equal((await patch({ action: 'teleport' })).status, 400);
  assert.equal((await patch({})).status, 400);
  assert.equal((await patch(null)).status, 400);
  assert.equal((await patch({ action: 'sync-onec' }, 'NH-0000-0001')).status, 404);
  assert.equal(pushes.length, 1, 'на отказе роутер всё равно сходил в 1С');
}));

test('PATCH cancel: отменяет демо-заказ и спорит с банком и с оплаченным', () => withSystem(async s => {
  await asAdmin(s);
  const { saveOrder, getOrder } = s.load('lib/orders.ts');
  const { PATCH } = s.load('app/api/orders/[id]/route.ts');
  const patch = (id, body) => PATCH(s.request(body, `${process.env.SHOP_URL}/api/orders/${id}`), { params: Promise.resolve({ id }) });

  const demoOrder = routeOrder({ demo: true, paymentId: 'DEMO-1', paymentUrl: undefined });
  await saveOrder(demoOrder);
  // Демо-заказ в 1С не едет: сеть в тесте запрещена, а любой вызов её поднял бы ошибку.
  assert.equal((await patch(demoOrder.id, { action: 'sync-onec' })).body.ok, true, 'sync-onec в демо должен быть успешен без сети');
  assert.equal((await getOrder(demoOrder.id)).onecSyncedAt, undefined, 'демо-заказ помечен выгруженным в 1С, которой нет');

  assert.equal((await patch(demoOrder.id, { action: 'cancel' })).status, 200);
  assert.equal((await getOrder(demoOrder.id)).status, 'cancelled');
  assert.equal((await patch(demoOrder.id, { action: 'cancel' })).status, 200, 'повторная отмена не должна плодить ошибку');

  const paid = routeOrder({ id: 'NH-ROUTE-2', demo: true, status: 'paid' });
  await saveOrder(paid);
  const conflict = await patch(paid.id, { action: 'cancel' });
  assert.equal(conflict.status, 409);
  assert.match(conflict.body.error, /возврат/i, 'отказ должен объяснять, что возврат делается в банке');

  Object.assign(process.env, LIVE_ENV);
  const liveOrder = routeOrder({ id: 'NH-ROUTE-3' });
  await saveOrder(liveOrder);
  const bank = await patch(liveOrder.id, { action: 'cancel' });
  assert.equal(bank.status, 409);
  assert.match(bank.body.error, /платёж в кабинете банка/, 'резерв снимают только после отмены платежа в банке');
  assert.equal((await getOrder(liveOrder.id)).status, 'awaiting_payment', 'отказ отмены всё равно закрыл заказ');
}));

test('PATCH retry-payment: ссылка доводится до конца, а не создаётся дважды', () => withSystem(async s => {
  Object.assign(process.env, LIVE_ENV);
  await asAdmin(s);
  const { saveOrder, getOrder } = s.load('lib/orders.ts');
  const { PATCH } = s.load('app/api/orders/[id]/route.ts');
  const patch = (id, body) => PATCH(s.request(body, `${process.env.SHOP_URL}/api/orders/${id}`), { params: Promise.resolve({ id }) });

  const inits = [];
  global.fetch = async (url, options = {}) => {
    if (url === 'https://securepay.tinkoff.ru/v2/Init') { inits.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ Success: true, PaymentURL: 'https://payment.example.test/session-2', PaymentId: '654321' }) }; }
    throw new Error('Unexpected external endpoint: ' + url);
  };
  // Сбой при создании: ссылки нет, есть paymentError — ровно то состояние, ради которого
  // на странице заказа и в админке живёт «Повторить».
  const failed = routeOrder({ paymentId: undefined, paymentUrl: undefined, paymentError: true });
  await saveOrder(failed);
  const retried = await patch(failed.id, { action: 'retry-payment' });
  assert.equal(retried.status, 200);
  assert.equal(inits.length, 1, 'повтор не обратился к банку');
  assert.equal(retried.body.order.paymentId, '654321');
  assert.equal(retried.body.order.paymentUrl, 'https://payment.example.test/session-2');
  assert.equal(Boolean(retried.body.order.paymentError), false, 'сбой остался записан после удачной оплаты');

  // Живая ссылка не перевыставляется, а слишком свежая попытка — это 409, а не второй счёт.
  assert.equal((await patch(failed.id, { action: 'retry-payment' })).body.order.paymentId, '654321', 'повтор перевыставил уже живую ссылку');
  assert.equal(inits.length, 1, 'банк вызвали второй раз за живой ссылкой');
  const fresh = routeOrder({ id: 'NH-ROUTE-4', paymentId: undefined, paymentUrl: undefined, paymentError: true, paymentInitAt: new Date().toISOString() });
  await saveOrder(fresh);
  const tooSoon = await patch(fresh.id, { action: 'retry-payment' });
  assert.equal(tooSoon.status, 409);
  assert.match(tooSoon.body.error, /чуть позже/);
  assert.equal(inits.length, 1, 'вторая попытка внутри минуты всё-таки ушла в банк');
}));