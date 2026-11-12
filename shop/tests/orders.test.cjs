const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createSystem, root } = require('./helpers.cjs');

const password = 'test-only-admin-passphrase';
const bankPassword = 'test-only-bank-passphrase';
// Позиции взяты из прайса поставщика: оливки GORDAL 300 г = 450 ₽, хамон «16» без кости = 6 750 ₽/кг.
const pack = { productId: 'nf-00000229', kind: 'pack', qty: 1 };
const cut = { productId: 'nf-00000213', kind: 'custom', weightG: 300 };

async function createOrder(s, items = [pack], deliveryId = 'pickup') {
  const quote = await s.load('lib/checkout.ts').quoteCart(items, deliveryId);
  const response = await s.load('app/api/orders/route.ts').POST(s.request({ customer: { name: 'Test customer', phone: '+79991234567' }, consent: true, items, deliveryId, deliveryAddress: deliveryId === 'pickup' ? '' : 'Test-only address', messenger: 'SMS', expectedItemsSum: quote.itemsSum, expectedDeliveryCost: quote.delivery.cost }));
  assert.equal(response.status, 201);
  return s.load('lib/orders.ts').getOrder(response.body.orderId);
}

async function admin(s) {
  process.env.ADMIN_PASSWORD = password;
  const response = await s.load('app/api/admin/login/route.ts').POST(s.request({ password }));
  assert.equal(response.status, 200);
  s.applyCookies(response);
}

function signedNotification(order, status, extra = {}) {
  const body = { TerminalKey: 'test-terminal', OrderId: order.id, PaymentId: order.paymentId, Amount: order.total * 100, Success: true, Status: status, ...extra };
  body.Token = crypto.createHash('sha256').update(Object.entries({ ...body, Password: bankPassword }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => String(value)).join('')).digest('hex');
  return body;
}

function live(s, failPush = false) {
  Object.assign(process.env, { SHOP_MODE: 'live', SHOP_URL: 'https://shop.example.test', ONEC_API_URL: 'https://catalog.example.test', TBANK_TERMINAL_KEY: 'test-terminal', TBANK_PASSWORD: bankPassword, TBANK_TAXATION: 'usn_income', TBANK_VAT: 'none' });
  const calls = [];
  const products = s.load('lib/products.ts').PRODUCTS;
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === process.env.ONEC_API_URL) return { ok: true, json: async () => ({ products }) };
    if (url === process.env.ONEC_API_URL + '/orders') return { ok: !failPush, status: failPush ? 503 : 200 };
    if (url === 'https://securepay.tinkoff.ru/v2/Init') return { ok: true, json: async () => ({ Success: true, PaymentURL: 'https://payment.example.test/session', PaymentId: '123456' }) };
    throw new Error('Unexpected external endpoint: ' + url);
  };
  return calls;
}

async function withSystem(action, options) {
  const system = createSystem(options);
  try { await action(system); } finally { system.cleanup(); }
}

// Штучные куски с id1c приходят из 1С:УНФ, в прайсе 0711 их нет,
// поэтому резервирование куска проверяется на каталоге-фикстуре.
function withPiece(catalog, id1c, weightG, fixedPrice) {
  return catalog.map((product) => product.id === 'nf-00000213'
    ? { ...product, pieces: [{ id1c, weightG, ...(fixedPrice === undefined ? {} : { price: fixedPrice }) }] }
    : product);
}

function legacyOrder(items, total) {
  return [{ id: 'NH-1881', createdAt: '2026-11-06T10:00:00.000Z', customer: { name: 'Test-only customer', phone: '+79991234567' }, delivery: { id: 'pickup', name: 'Pickup', cost: 0 }, messenger: 'SMS', items, itemsSum: total, total, status: 'paid', paymentId: 'TEST-1' }];
}

test('the supplier price list is the only catalog source', () => withSystem(async s => {
  const { PRODUCTS, PREVIEWS, KITS } = s.load('lib/products.ts');
  const rows = JSON.parse(fs.readFileSync(path.join(root, 'scripts/price-0711.rows.json'), 'utf8'));
  const priced = rows.filter((row) => row.price > 0);
  assert.equal(rows.length, 210);
  assert.equal(PRODUCTS.length, priced.length);
  assert.equal(PREVIEWS.length, rows.length - priced.length);
  const entries = [...PRODUCTS, ...PREVIEWS];
  assert.equal(new Set(entries.map((entry) => entry.id)).size, rows.length);
  assert.equal(entries.filter((entry) => entry.code).every((entry) => rows.some((row) => row.code === entry.code)), true);
  assert.equal(PRODUCTS.every((product) => priced.some((row) => row.code === product.code)), true);
  assert.equal(PREVIEWS.every((preview) => !('price' in preview) && !('packs' in preview) && !('pieces' in preview)), true);
  assert.equal(PREVIEWS.every((preview) => !PRODUCTS.some((product) => product.id === preview.id)), true);
  assert.equal(KITS.length, 3);
  assert.equal(KITS.every((kit) => kit.items.length > 0 && kit.items.every((item) => PRODUCTS.find((product) => product.id === item.productId)?.packs[item.packIdx]?.price > 0)), true);
  assert.equal(PRODUCTS.every((product) => product.packs.every((item) => item.price > 0)), true);
  assert.equal(PRODUCTS.filter((product) => product.kind === 'piece').every((product) => product.pricePerKg > 0 && product.packs.length === 0), true);
  // Цена каждой позиции — ровно цена из прайса, а не «любая положительная».
  const priceByCode = new Map(priced.map((row) => [row.code, row.price]));
  assert.equal(PRODUCTS.every((product) => {
    const source = priceByCode.get(product.code);
    return product.kind === 'piece' ? product.pricePerKg === source : product.packs.some((pack) => pack.price === source);
  }), true);
}));

test('product photos match verified sources and both asset mirrors', () => withSystem(async s => {
  const { PRODUCTS, PREVIEWS } = s.load('lib/products.ts');
  const rows = JSON.parse(fs.readFileSync(path.join(root, 'scripts/price-0711.rows.json'), 'utf8'));
  const rejected = new Set(['НФ-00000112', 'НФ-00000228']);
  const mediaCodes = new Set(rows.filter(row => row.media && !rejected.has(row.code)).map(row => row.code));
  for (const product of PRODUCTS) {
    const expected = mediaCodes.has(product.code) ? `img/${product.id}.webp` : undefined;
    assert.equal(product.imageUrl, expected ? `/${expected}` : undefined, product.id);
  }
  const entries = [...PRODUCTS, ...PREVIEWS];
  for (const entry of PREVIEWS.filter(item => item.category !== 'chocolate')) {
    assert.equal(entry.imageUrl, undefined, entry.id);
  }
  for (const entry of entries.filter(item => item.imageUrl)) {
    const asset = entry.imageUrl.slice(1);
    const next = fs.readFileSync(path.join(root, 'public', asset));
    assert.deepEqual(next, fs.readFileSync(path.join(root, '..', asset)), entry.id);
    const meta = await require('sharp')(next).metadata();
    assert.equal(meta.width, entry.imageW, entry.id);
    assert.equal(meta.height, entry.imageH, entry.id);
  }
}));

test('custom cut is priced from the price-list rate and stays inside 50–2000 g', () => withSystem(async s => {
  const { resolveCart } = s.load('lib/orders.ts');
  const products = s.load('lib/products.ts').PRODUCTS;
  const price = (weightG) => resolveCart([{ ...cut, weightG }], new Set(), products).itemsSum;
  assert.equal(price(300), 2025);
  assert.equal(price(50), 338);
  assert.equal(price(2000), 13500);
  const resolved = resolveCart([cut], new Set(), products);
  assert.equal(resolved.items[0].pricePerKg, 6750);
  assert.equal(resolved.items[0].label, 'Отрез под заказ ~300\u00A0г');
  assert.equal(resolved.items[0].requiresWeightCheck, true);
  assert.equal(resolved.hasWeightCheck, true);
  for (const weightG of [49, 2001, 300.5, '300', null, 0, -300]) assert.equal(resolveCart([{ ...cut, weightG }], new Set(), products).ok, false);
}));

test('kinds the price list cannot supply are rejected: pieces, average, bulk', () => withSystem(async s => {
  const { resolveCart } = s.load('lib/orders.ts');
  const products = s.load('lib/products.ts').PRODUCTS;
  assert.equal(products.every((product) => product.pieces.length === 0 && product.bulk === null), true);
  assert.equal(resolveCart([{ productId: 'nf-00000213', kind: 'piece', pieceId1c: 'nf-00000213-230' }], new Set(), products).ok, false);
  assert.equal(resolveCart([{ productId: 'nf-00000213', kind: 'average' }], new Set(), products).ok, false);
  assert.equal(resolveCart([{ productId: 'nf-00000213', kind: 'bulk', weightG: 350 }], new Set(), products).ok, false);
  assert.equal(resolveCart([{ productId: 'nf-00000229', kind: 'custom', weightG: 300 }], new Set(), products).ok, false);
  assert.equal(resolveCart([{ productId: 'nf-00000229', kind: 'average' }], new Set(), products).ok, false);
  assert.equal(resolveCart([{ productId: 'nf-00000229', kind: 'pack', packIdx: 1 }], new Set(), products).ok, false);
}));

test('invalid cart shapes, fractional quantities, indices and duplicate pieces are rejected', () => withSystem(async s => {
  const { resolveCart } = s.load('lib/orders.ts');
  const products = withPiece(s.load('lib/products.ts').PRODUCTS, 'nf-00000213-230', 230);
  const piece = { productId: 'nf-00000213', kind: 'piece', pieceId1c: 'nf-00000213-230' };
  const tooMany = Array.from({ length: 101 }, () => pack);
  for (const inputs of [null, {}, [], [{ ...pack, qty: 1.5 }], [{ ...pack, qty: '2' }], [{ ...pack, qty: 21 }], [{ ...pack, packIdx: -1 }], [{ productId: 'nf-00000999', kind: 'pack' }], [{ productId: 42, kind: 'pack' }], [piece, piece], tooMany]) assert.equal(resolveCart(inputs, new Set(), products).ok, false);
  assert.equal(resolveCart([{ productId: 'nf-00000213', kind: 'pack', packIdx: 0 }], new Set(), products).ok, false);
  assert.equal(resolveCart([{ ...piece, qty: 2 }], new Set(), products).ok, false);
}));

test('a piece reserved by one order is refused by another until the first is cancelled', () => withSystem(async s => {
  const { resolveCart, saveOrder, readOrders, updateOrder, getOrder, reservedPieceIds } = s.load('lib/orders.ts');
  const products = withPiece(s.load('lib/products.ts').PRODUCTS, 'nf-00000213-230', 230);
  const line = { productId: 'nf-00000213', kind: 'piece', pieceId1c: 'nf-00000213-230' };
  assert.equal(resolveCart([line], await reservedPieceIds(), products).ok, true);
  assert.equal(resolveCart([line], new Set(['nf-00000213-230']), products).ok, false);
  assert.equal(resolveCart([line], new Set(), withPiece(products, 'nf-00000213-230', 230, 1600)).items[0].price, 1600);
  assert.equal(resolveCart([line], new Set(), products).items[0].price, 1553);

  const { delivery } = await s.load('lib/checkout.ts').quoteCart([pack], 'pickup');
  const now = new Date().toISOString();
  const stored = (id, items) => ({ id, accessToken: crypto.randomBytes(16).toString('hex'), createdAt: now, consentedAt: now, demo: true, customer: { name: 'Test customer', phone: '+79991234567' }, delivery, messenger: 'SMS', items, itemsSum: items.reduce((sum, item) => sum + item.price, 0), total: items.reduce((sum, item) => sum + item.price, 0), status: 'awaiting_payment' });
  await saveOrder(stored('NH-TEST-A', resolveCart([line], new Set(), products).items));
  assert.deepEqual([...await reservedPieceIds()], ['nf-00000213-230']);
  await assert.rejects(saveOrder(stored('NH-TEST-B', resolveCart([line], new Set(), products).items)), /зарезервирован/i);
  assert.equal((await readOrders()).length, 1);
  await updateOrder('NH-TEST-A', { status: 'cancelled' });
  assert.deepEqual([...await reservedPieceIds()], []);
  await saveOrder(stored('NH-TEST-C', resolveCart([line], new Set(), products).items));
  assert.equal((await getOrder('NH-TEST-C')).items[0].pieceId1c, 'nf-00000213-230');
}));

test('priceless price-list rows are previews and cannot enter a payable order', () => withSystem(async s => {
  const { PREVIEWS } = s.load('lib/products.ts');
  assert.equal(PREVIEWS.length, 27);
  const checkout = s.load('lib/checkout.ts');
  for (const preview of PREVIEWS) {
    for (const kind of ['pack', 'average', 'custom']) {
      await assert.rejects(checkout.quoteCart([{ productId: preview.id, kind, weightG: 300 }], 'pickup'), (error) => error.status === 409);
    }
  }
}));

test('server uses canonical catalog prices, not prices from the browser', () => withSystem(async s => {
  const products = structuredClone(s.load('lib/products.ts').PRODUCTS);
  products.find((p) => p.id === 'nf-00000229').packs[0].price = 777;
  const { resolveCart } = s.load('lib/orders.ts');
  assert.equal(resolveCart([{ ...pack, price: 1, qty: 2 }], new Set(), products).itemsSum, 1554);
  assert.equal(resolveCart([{ ...pack, price: 1 }], new Set(), s.load('lib/products.ts').PRODUCTS).itemsSum, 450);
  assert.equal(resolveCart([{ ...cut, price: 1, pricePerKg: 1 }], new Set(), products).itemsSum, 2025);
}));

test('unknown delivery cost is not invented and is confirmed by the shop before payment', () => withSystem(async s => {
  const quote = await s.load('lib/checkout.ts').quoteCart([pack], 'cdek');
  assert.equal(quote.delivery.cost, null);
  assert.equal(quote.total, null);
  assert.equal(quote.needsConfirmation, true);
  const order = await createOrder(s, [pack], 'cdek');
  assert.equal(order.status, 'awaiting_confirmation');
  assert.equal(order.paymentId, undefined);
  await admin(s);
  const route = s.load('app/api/orders/[id]/route.ts');
  assert.equal((await route.PATCH(s.request({ action: 'confirm-order', weights: {}, deliveryCost: 100001 }), s.context(order.id))).status, 400);
  assert.equal((await route.PATCH(s.request({ action: 'confirm-order', weights: {} }), s.context(order.id))).status, 400);
  assert.equal((await s.load('lib/orders.ts').getOrder(order.id)).status, 'awaiting_confirmation');
  const priced = await route.PATCH(s.request({ action: 'confirm-order', weights: {}, deliveryCost: 350 }), s.context(order.id));
  assert.equal(priced.status, 200);
  const saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.equal(saved.delivery.cost, 350);
  assert.equal(saved.total, 800);
  assert.equal(saved.status, 'awaiting_payment');
}));

test('checkout validates customer data, consent and the accepted server quote', () => withSystem(async s => {
  const route = s.load('app/api/orders/route.ts');
  const valid = { customer: { name: 'Test', phone: '+79991234567' }, consent: true, items: [pack], deliveryId: 'pickup' };
  for (const body of [null, { customer: { name: 1, phone: '+79991234567' } }, { ...valid, phone: undefined, customer: { name: 'Test', phone: '+7999123456789012345' } }, { ...valid, deliveryId: 'yandex' }, { ...valid, consent: false }, { ...valid, messenger: 'Carrier pigeon' }]) assert.equal((await route.POST(s.request(body))).status, 400);
  const response = await route.POST(s.request({ ...valid, expectedItemsSum: 1, expectedDeliveryCost: 0 }));
  assert.equal(response.status, 409);
  assert.equal(response.body.quote.itemsSum, 450);
  assert.equal((await s.load('lib/orders.ts').readOrders()).length, 0);
}));

test('private order access requires its token, cookie or a signed admin session', () => withSystem(async s => {
  const order = await createOrder(s);
  const route = s.load('app/api/orders/[id]/route.ts');
  assert.equal((await route.GET(s.request(null), s.context(order.id))).status, 404);
  assert.equal(await s.load('lib/order-access.ts').getAuthorizedOrder(order.id), undefined);
  assert.equal((await route.GET(s.request(null, `http://localhost:3302/api/orders/${order.id}?token=wrong`), s.context(order.id))).status, 404);
  assert.equal((await route.GET(s.request(null, `http://localhost:3302/api/orders/${order.id}?token=${order.accessToken}`), s.context(order.id))).status, 200);
  await admin(s);
  assert.equal((await route.GET(s.request(null), s.context(order.id))).status, 200);
}));

test('admin has no default password; sessions are signed, expiring and origin guarded', () => withSystem(async s => {
  const auth = s.load('lib/admin.ts');
  const login = s.load('app/api/admin/login/route.ts');
  assert.equal(auth.adminPassword(), undefined);
  assert.equal((await login.POST(s.request({ password: 'nashhamon-dev' }))).status, 503);
  process.env.ADMIN_PASSWORD = password;
  assert.equal((await login.POST(s.request({ password }, undefined, { origin: 'https://foreign.example.test' }))).status, 403);
  const token = auth.adminToken();
  assert.equal(auth.verifyAdminToken(token), true);
  assert.equal(auth.verifyAdminToken(token.slice(0, -1) + (token.endsWith('0') ? '1' : '0')), false);
  const payload = `${Math.floor(Date.now() / 1000) - 1}.${'a'.repeat(32)}`;
  const expired = `${payload}.${crypto.createHmac('sha256', password).update(payload).digest('hex')}`;
  assert.equal(auth.verifyAdminToken(expired), false);
}));

test('public shop origin is accepted when Next internally normalizes the host', () => withSystem(async s => {
  process.env.ADMIN_PASSWORD = password;
  process.env.SHOP_URL = 'http://127.0.0.1:3302';
  const login = s.load('app/api/admin/login/route.ts');
  const response = await login.POST(s.request({ password }, 'http://localhost:3302/api/admin/login', { origin: 'http://127.0.0.1:3302' }));
  assert.equal(response.status, 200);
  assert.equal((await login.POST(s.request({ password }, undefined, { origin: 'https://foreign.example.test' }))).status, 403);
}));

test('same-origin request is accepted without SHOP_URL even when Next reports localhost', () => withSystem(async s => {
  process.env.ADMIN_PASSWORD = password;
  delete process.env.SHOP_URL;
  const login = s.load('app/api/admin/login/route.ts');
  const same = { host: '127.0.0.1:3302', origin: 'http://127.0.0.1:3302' };
  assert.equal((await login.POST(s.request({ password }, 'http://localhost:3302/api/admin/login', same))).status, 200);
  assert.equal((await login.POST(s.request({ password }, 'http://localhost:3302/api/admin/login', { host: '127.0.0.1:3302', origin: 'http://mallory.example.test:3302' }))).status, 403);
  assert.equal((await login.POST(s.request({ password }, 'http://localhost:3302/api/admin/login', { origin: 'https://foreign.example.test' }))).status, 403);
}));

test('every weight position is confirmed atomically before payment starts', () => withSystem(async s => {
  const order = await createOrder(s, [cut, pack]);
  assert.equal(order.status, 'awaiting_confirmation');
  assert.equal(order.total, 2475);
  assert.equal(order.paymentId, undefined);
  const weighted = order.items.filter((item) => item.requiresWeightCheck);
  assert.equal(weighted.length, 1);
  await admin(s);
  const route = s.load('app/api/orders/[id]/route.ts');
  for (const weights of [{ other: 250 }, { [weighted[0].uid]: 0 }, { [weighted[0].uid]: 250.5 }, { [weighted[0].uid]: 30001 }, { [weighted[0].uid]: '250' }]) {
    assert.equal((await route.PATCH(s.request({ action: 'confirm-order', weights }), s.context(order.id))).status, 400);
    const untouched = await s.load('lib/orders.ts').getOrder(order.id);
    assert.equal(untouched.status, 'awaiting_confirmation');
    assert.equal(untouched.items.filter((item) => item.requiresWeightCheck).every((item) => !item.weightConfirmed), true);
    assert.equal(untouched.total, 2475);
  }
  const complete = await route.PATCH(s.request({ action: 'confirm-order', weights: { [weighted[0].uid]: 250 } }), s.context(order.id));
  assert.equal(complete.status, 200);
  const saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.equal(saved.items[0].price, 1688);
  assert.equal(saved.items[0].label, 'Отрез под заказ 250\u00A0г');
  assert.equal(saved.items[0].weightConfirmed, true);
  assert.equal(saved.items[1].price, 450);
  assert.equal(saved.itemsSum, 2138);
  assert.equal(saved.status, 'awaiting_payment');
  assert.equal(saved.paymentId.startsWith('DEMO-'), true);
  assert.equal((await route.PATCH(s.request({ action: 'confirm-order', weights: { [weighted[0].uid]: 250 } }), s.context(order.id))).status, 409);
}));

test('delivery threshold is recalculated on confirmed weight using agreed order terms', () => withSystem(async s => {
  const order = await createOrder(s, [cut], 'yandex');
  assert.equal(order.itemsSum, 2025);
  assert.equal(order.delivery.cost, 350);
  assert.equal(order.total, 2375);
  process.env.FREE_DELIVERY_FROM = '5000';
  await admin(s);
  const response = await s.load('app/api/orders/[id]/route.ts').PATCH(s.request({ action: 'confirm-order', weights: { [order.items[0].uid]: 500 } }), s.context(order.id));
  assert.equal(response.status, 200);
  const saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.equal(saved.itemsSum, 3375);
  assert.equal(saved.delivery.cost, 0);
  assert.equal(saved.total, 3375);
  assert.equal(saved.status, 'awaiting_payment');
}, { env: { FREE_DELIVERY_FROM: '3000', DELIVERY_YANDEX_RUB: '350' } }));

test('a priced courier option is payable without manual confirmation', () => withSystem(async s => {
  const order = await createOrder(s, [{ ...pack, qty: 4 }], 'drivee');
  assert.equal(order.delivery.cost, 350);
  assert.equal(order.itemsSum, 1800);
  assert.equal(order.total, 2150);
  assert.equal(order.status, 'awaiting_payment');
  assert.equal(order.paymentId.startsWith('DEMO-'), true);
}, { env: { DELIVERY_DRIVEE_RUB: '350' } }));

test('demo payment is private, explicit and never accepted through bank notifications', () => withSystem(async s => {
  const order = await createOrder(s);
  const detail = s.load('app/api/orders/[id]/route.ts');
  assert.equal((await detail.POST(s.request({ action: 'demo-pay' }), s.context(order.id))).status, 404);
  assert.equal((await s.load('app/api/tbank/notify/route.ts').POST(s.request({ OrderId: order.id, Success: 'true', Status: 'CONFIRMED' }))).status, 403);
  const response = await detail.POST(s.request({ action: 'demo-pay', token: order.accessToken }), s.context(order.id));
  assert.equal(response.status, 200);
  assert.equal((await s.load('lib/orders.ts').getOrder(order.id)).status, 'paid');
  assert.equal((await detail.POST(s.request({ action: 'demo-pay', token: order.accessToken }), s.context(order.id))).status, 200);
}));

test('live bank initialization has a correctly signed token and balanced receipt', () => withSystem(async s => {
  const calls = live(s);
  const order = await createOrder(s, [{ ...pack, qty: 2 }]);
  assert.equal(order.demo, false);
  const body = JSON.parse(calls.find((c) => c.url.includes('/Init')).options.body);
  const expected = crypto.createHash('sha256').update(Object.entries({ ...body, Password: bankPassword }).filter(([key, value]) => key !== 'Token' && typeof value !== 'object').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => String(value)).join('')).digest('hex');
  assert.equal(body.Token, expected);
  assert.equal(body.Amount, 90000);
  assert.equal(body.Receipt.Items.reduce((sum, item) => sum + item.Amount, 0), body.Amount);
  assert.equal(body.Receipt.Items.every((item) => item.PaymentMethod === 'full_prepayment'), true);
  assert.equal((await s.load('app/api/orders/[id]/route.ts').POST(s.request({ action: 'demo-pay', token: order.accessToken }), s.context(order.id))).status, 403);
}));

test('bank notifications verify payment ID, amount, boolean status and monotonic payment state', () => withSystem(async s => {
  const calls = live(s);
  const order = await createOrder(s);
  const notify = s.load('app/api/tbank/notify/route.ts');
  assert.equal((await notify.POST(s.request(signedNotification(order, 'CONFIRMED', { Amount: 1 })))).status, 409);
  assert.equal((await notify.POST(s.request(signedNotification(order, 'CONFIRMED', { PaymentId: 'other' })))).status, 409);
  const authorized = await notify.POST(s.request(signedNotification(order, 'AUTHORIZED')));
  assert.equal(authorized.body, 'OK');
  assert.equal((await s.load('lib/orders.ts').getOrder(order.id)).status, 'awaiting_payment');
  const before = calls.filter((c) => c.url.endsWith('/orders')).length;
  assert.equal((await notify.POST(s.request(signedNotification(order, 'CONFIRMED')))).body, 'OK');
  assert.equal((await s.load('lib/orders.ts').getOrder(order.id)).status, 'paid');
  assert.equal((await notify.POST(s.request(signedNotification(order, 'REJECTED', { Success: false })))).body, 'OK');
  await notify.POST(s.request(signedNotification(order, 'CONFIRMED')));
  assert.equal((await s.load('lib/orders.ts').getOrder(order.id)).status, 'paid');
  assert.equal(calls.filter((c) => c.url.endsWith('/orders')).length, before + 1);
  assert.equal(JSON.parse(calls.filter((c) => c.url.endsWith('/orders')).at(-1).options.body).status, 'paid');
}));

test('недоступная или пустая выгрузка 1С держит витрину на прайсе 0711 и не молчит', () => withSystem(async s => {
  live(s);
  const { PRODUCTS, PREVIEWS, loadCatalog, getProducts, catalogHealth } = s.load('lib/products.ts');
  global.fetch = async () => ({ ok: true, json: async () => ({ products: [] }) });
  assert.deepEqual(await getProducts(), PRODUCTS, 'пустая выгрузка обязана вернуть прайс 0711, а не пустой каталог');
  const empty = await loadCatalog();
  assert.equal(empty.origin, 'built-in');
  assert.match(empty.notice, /empty product list/, `причина отката не названа: ${empty.notice}`);
  assert.equal(empty.previews.length, PREVIEWS.length, 'откат на прайс обязан показать и позиции без цены');
  global.fetch = async () => ({ ok: false, status: 503 });
  assert.deepEqual(await getProducts(), PRODUCTS);
  const quote = await s.load('lib/checkout.ts').quoteCart([pack], 'pickup');
  assert.equal(quote.itemsSum, 450, 'заказ после отката посчитан не по прайсу 0711');
  assert.ok(catalogHealth().notice.includes('503'), `503 не попала в здоровье каталога: ${catalogHealth().notice}`);
  assert.equal(catalogHealth().origin, 'built-in');
}));

test('в демо витрина остаётся прайсом 0711 вместе с позициями без цены', () => withSystem(async s => {
  const { PRODUCTS, PREVIEWS, loadCatalog } = s.load('lib/products.ts');
  assert.ok(PREVIEWS.length > 0, 'в прайсе не осталось позиций «уточнить в лавке» — у гейта пропала опора');
  const catalog = await loadCatalog();
  assert.equal(catalog.origin, 'built-in');
  assert.equal(catalog.notice, null, 'демо-режим не должен выглядеть как откат');
  assert.deepEqual(catalog.products, PRODUCTS);
  assert.deepEqual(catalog.previews, PREVIEWS);
}));

test('позиции без цены не подмешиваются к живой выгрузке 1С', () => withSystem(async s => {
  live(s);
  const { PRODUCTS, loadCatalog } = s.load('lib/products.ts');
  global.fetch = async () => ({ ok: true, json: async () => ({ products: PRODUCTS }) });
  const fromOneC = await loadCatalog();
  assert.equal(fromOneC.origin, 'onec');
  assert.equal(fromOneC.notice, null, 'живая выгрузка не должна выглядеть откатом');
  assert.deepEqual(fromOneC.previews, [], '1С отдал прайс, а витрина добавила к нему позиции без цены');
}));

test('позиции без цены приходят в каталог только с сервера, а не прямо из прайса', () => {
  const client = fs.readFileSync(path.join(root, 'components/CatalogClient.tsx'), 'utf8');
  assert.doesNotMatch(client, /\bPREVIEWS\b/, 'прямой импорт прайса вернул бы позиции без цены в живой выгрузке 1С');
  for (const page of ['app/page.tsx', 'app/catalog/page.tsx']) {
    const source = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(source, /loadCatalog\(/, `${page}: каталог снова берётся без решения о запасном прайсе`);
    assert.match(source, /previews=\{catalog\.previews\}/, `${page}: CatalogClient вызван без позиций без цены`);
  }
});

test('a live catalog that breaks the contract is refused, not half-trusted', () => withSystem(async s => {
  live(s);
  const { PRODUCTS, loadCatalog } = s.load('lib/products.ts');
  const zeroPrice = structuredClone(PRODUCTS);
  zeroPrice.find((p) => p.id === 'nf-00000229').packs[0].price = 0;
  const duplicatedPiece = structuredClone(PRODUCTS);
  duplicatedPiece[1].pieces = [{ id1c: 'same-piece', weightG: 100 }];
  duplicatedPiece[2].pieces = [{ id1c: 'same-piece', weightG: 200 }];
  const renamed = structuredClone(PRODUCTS);
  renamed[0].id = renamed[1].id;
  for (const products of [zeroPrice, duplicatedPiece, renamed]) {
    global.fetch = async () => ({ ok: true, json: async () => ({ products }) });
    const catalog = await loadCatalog();
    assert.deepEqual(catalog.products, PRODUCTS, 'битую выгрузку подменили не прайсом 0711');
    assert.match(catalog.notice, /invalid product data/, 'битая выгрузка прошла без предупреждения');
  }
}));

test('OneC failures remain visible and retryable without losing the order', () => withSystem(async s => {
  live(s, true);
  const order = await createOrder(s);
  const saved = await s.load('lib/orders.ts').getOrder(order.id);
  assert.equal(saved.onecSyncError, 'one_c_http_503');
  assert.equal(saved.paymentId, '123456');
  assert.equal(saved.status, 'awaiting_payment');
}));

test('legacy JSON import is non-destructive and restores weight rates from the catalog', async () => {
  const legacy = legacyOrder([
    { uid: 'it-1', productId: 'nf-00000241', title: 'Хлебные палочки Панеальба Грицини', label: '125 г', price: 370, weightG: 125, requiresWeightCheck: false, pieceId1c: null, qty: 1 },
    { uid: 'it-2', productId: 'nf-00000213', title: 'Хамон, кусок без кости, 16 мес.', label: 'Отрез под заказ ~300\u00A0г', price: 2025, weightG: 300, requiresWeightCheck: true, pieceId1c: null, qty: 1 },
  ], 2395);
  await withSystem(async s => {
    const filename = process.env.ORDERS_LEGACY_PATH;
    const original = fs.readFileSync(filename, 'utf8');
    const imported = await s.load('lib/orders.ts').readOrders();
    assert.equal(imported.length, 1);
    assert.equal(imported[0].consentedAt, null);
    assert.equal(imported[0].demo, true);
    assert.match(imported[0].accessToken, /^[a-f0-9]{32}$/);
    assert.equal(imported[0].items[0].pricePerKg, null);
    assert.equal(imported[0].items[1].pricePerKg, 6750);
    assert.equal(imported[0].items[1].weightConfirmed, true);
    assert.equal(fs.readFileSync(filename, 'utf8'), original);
  }, { legacy });
  await withSystem(async s => {
    await assert.rejects(s.load('lib/orders.ts').readOrders(), SyntaxError);
    assert.equal(fs.readFileSync(process.env.ORDERS_LEGACY_PATH, 'utf8'), '{broken');
  }, { legacy: '{broken' });
  await withSystem(async s => {
    await assert.rejects(s.load('lib/orders.ts').readOrders(), /Legacy weight price cannot be restored/);
  }, { legacy: legacyOrder([{ uid: 'it-1', productId: 'grissini', title: 'Снятый с продажи товар', label: 'На развес 200 г', price: 390, weightG: 200, requiresWeightCheck: true, pieceId1c: null, qty: 1 }], 390) });
});

test('independent processes preserve all orders in SQLite', () => withSystem(async s => {
  await s.load('lib/orders.ts').readOrders();
  const dbPath = process.env.ORDERS_DB_PATH;
  async function worker(prefix) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, 'tests/store-worker.cjs'), dbPath, prefix], { cwd: root, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', (data) => output += data);
      child.stderr.on('data', (data) => output += data);
      child.on('error', reject);
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(output)));
    });
  }
  await Promise.all([worker('A'), worker('B')]);
  const orders = await s.load('lib/orders.ts').readOrders();
  assert.equal(orders.length, 40);
  assert.equal(new Set(orders.map((order) => order.id)).size, 40);
}));
