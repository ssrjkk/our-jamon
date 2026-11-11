const test = require('node:test');
const assert = require('node:assert/strict');
const { createSystem } = require('./helpers.cjs');

async function withSystem(action, options) {
  const system = createSystem(options);
  try { await action(system); } finally { system.cleanup(); }
}

test('formatWeight: граммы до килограмма, килограммы с запятой и неразрывным пробелом', () => withSystem(async s => {
  const { formatWeight } = s.load('lib/orders.ts');
  assert.equal(formatWeight(50), '50 г');
  assert.equal(formatWeight(999), '999 г');
  assert.equal(formatWeight(1000), '1,0 кг');
  assert.equal(formatWeight(1500), '1,5 кг');
  assert.equal(formatWeight(2300), '2,3 кг');
}));

test('orderStatusRu: каждый статус заказа имеет русскую метку', () => withSystem(async s => {
  const { orderStatusRu } = s.load('lib/orders.ts');
  assert.equal(orderStatusRu('awaiting_confirmation'), 'Согласуем заказ');
  assert.equal(orderStatusRu('awaiting_payment'), 'Ожидает оплаты');
  assert.equal(orderStatusRu('paid'), 'Оплачен');
  assert.equal(orderStatusRu('cancelled'), 'Отменён');
}));

test('идентификаторы заказа и токены доступа: формат и уникальность', () => withSystem(async s => {
  const { generateOrderId, newAccessToken } = s.load('lib/orders.ts');
  const ids = new Set(Array.from({ length: 50 }, generateOrderId));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^NH-[0-9A-F]{12}$/);
  const tokens = new Set(Array.from({ length: 50 }, newAccessToken));
  assert.equal(tokens.size, 50);
  for (const token of tokens) assert.match(token, /^[a-f0-9]{32}$/);
}));

test('цена куска: фиксированная важнее ставки, ставка округляется до рубля', () => withSystem(async s => {
  const { piecePriceOf, averageWeightOf, calcPricePer100g } = s.load('lib/products.ts');
  const product = { pricePerKg: 6750, pieces: [{ weightG: 230 }, { weightG: 270 }] };
  assert.equal(piecePriceOf(product, 230), 1553);
  assert.equal(piecePriceOf(product, 230, 1600), 1600);
  assert.equal(piecePriceOf(product, 0), 0);
  assert.equal(averageWeightOf(product), 250);
  assert.equal(averageWeightOf({ pieces: [] }), 0);
  assert.equal(calcPricePer100g(6750), 675);
  assert.equal(calcPricePer100g(6744), 674);
}));

test('доставка: порог бесплатности включительно, неизвестная стоимость остаётся null', () => withSystem(async s => {
  const { deliveryCostFor, resolveDelivery, freeDeliveryFrom } = s.load('lib/delivery.ts');
  assert.equal(deliveryCostFor({ baseCost: 300, freeFrom: 5000 }, 4999), 300);
  assert.equal(deliveryCostFor({ baseCost: 300, freeFrom: 5000 }, 5000), 0);
  assert.equal(deliveryCostFor({ baseCost: null, freeFrom: 5000 }, 4999), null);
  assert.equal(deliveryCostFor({ baseCost: null, freeFrom: 5000 }, 5000), 0);
  assert.equal(deliveryCostFor({ baseCost: 300, freeFrom: null }, 100000), 300);
  assert.equal(freeDeliveryFrom(), null);
  assert.equal(resolveDelivery('net-takoy', 1000), undefined);
  const pickup = resolveDelivery('pickup', 1000);
  assert.equal(pickup.cost, 0);
  assert.equal(pickup.freeFrom, null);
  const cdek = resolveDelivery('cdek', 1000, 'Пункт выдачи');
  assert.equal(cdek.cost, null);
  assert.equal(cdek.address, 'Пункт выдачи');
  assert.equal(resolveDelivery('pickup', 1000, 'Адрес').address, undefined);
}));

test('порог бесплатной доставки из окружения меняет расчёт курьера', () => withSystem(async s => {
  const { freeDeliveryFrom, resolveDelivery } = s.load('lib/delivery.ts');
  assert.equal(freeDeliveryFrom(), 5000);
  const yandex = resolveDelivery('yandex', 5000);
  assert.equal(yandex.freeFrom, 5000);
  assert.equal(yandex.cost, 0);
  assert.equal(resolveDelivery('yandex', 4999).cost, null);
}, { env: { FREE_DELIVERY_FROM: '5000' } }));

test('configuredAmount: пустое — null, ноль допустим, дробное и отрицательное — ошибка', () => withSystem(async s => {
  const { configuredAmount } = s.load('lib/config.ts');
  assert.equal(configuredAmount('TEST_AMOUNT_UNSET'), null);
  try {
    process.env.TEST_AMOUNT = '  ';
    assert.equal(configuredAmount('TEST_AMOUNT'), null);
    process.env.TEST_AMOUNT = '0';
    assert.equal(configuredAmount('TEST_AMOUNT'), 0);
    process.env.TEST_AMOUNT = '5000';
    assert.equal(configuredAmount('TEST_AMOUNT'), 5000);
    for (const bad of ['-1', '12.5', 'abc', '9007199254740992']) {
      process.env.TEST_AMOUNT = bad;
      assert.throws(() => configuredAmount('TEST_AMOUNT'), /Invalid amount configuration/);
    }
  } finally {
    delete process.env.TEST_AMOUNT;
  }
}));

test('секреты сравниваются без раннего выхода, cookie заказа предсказуема', () => withSystem(async s => {
  const { equalSecrets } = s.load('lib/admin.ts');
  const { orderCookieName } = s.load('lib/order-access.ts');
  assert.equal(equalSecrets('secret', 'secret'), true);
  assert.equal(equalSecrets('secret', 'Secret'), false);
  assert.equal(equalSecrets('secret', 'secret-longer'), false);
  assert.equal(equalSecrets('', ''), true);
  assert.equal(orderCookieName('NH-ABC123'), 'nh_order_NH-ABC123');
}));