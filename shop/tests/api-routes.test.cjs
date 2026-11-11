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

test('POST /api/cart: живой каталог не настроен — 503, не выдуманный расчёт', () => withSystem(async s => {
  const { POST } = s.load('app/api/cart/route.ts');
  const res = await POST(s.request({ items: [pack], deliveryId: 'pickup' }));
  assert.equal(res.status, 503);
  assert.ok(res.body.error);
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

test('GET /api/products: живой каталог не настроен — 503, прайс не подменяется молча', () => withSystem(async s => {
  const { GET } = s.load('app/api/products/route.ts');
  const res = await GET();
  assert.equal(res.status, 503);
  assert.ok(res.body.error);
}, { env: { SHOP_MODE: 'live' } }));