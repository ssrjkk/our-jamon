const test = require('node:test');
const assert = require('node:assert/strict');
const { createSystem, root, priceWeightRounds } = require('./helpers.cjs');

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

// Клиент считал (w/1000)*rate, сервер — w*rate/1000: на 174 из 19 510 достижимых весов
// карточка показывала на 1 ₽ меньше заказа. Гейт перебирает все веса всех товаров,
// которые вообще можно оформить как отрез, и сверяет сумму сервера с суммой карточки.
test('отрез: сервер и карточка дают одну сумму на всех 19 510 достижимых весах', () => withSystem(async s => {
  const { PRODUCTS, piecePriceOf } = s.load('lib/products.ts');
  const { resolveCart } = s.load('lib/orders.ts');
  const cuts = PRODUCTS.filter((product) => product.kind === 'piece' && product.category === 'piece');
  assert.ok(cuts.length >= 8, `товаров с отрезом должно быть не меньше 8, найдено ${cuts.length}`);
  let checked = 0;
  for (const product of cuts) {
    for (let weightG = 50; weightG <= 2000; weightG += 1) {
      const resolved = resolveCart([{ productId: product.id, kind: 'custom', weightG, qty: 1 }], new Set(), PRODUCTS);
      assert.equal(resolved.ok, true, `${product.id}: сервер отверг ${weightG} г`);
      const cardPrice = piecePriceOf(product, weightG);
      assert.equal(resolved.items[0].price, cardPrice, `${product.id} ${weightG} г: заказ ${resolved.items[0].price} ₽, карточка ${cardPrice} ₽`);
      checked += 1;
    }
  }
  assert.equal(checked, cuts.length * 1951);
}));

// Вторая реализация округления обязана оставаться невозможной: иначе дрейф
// вернётся в любом файле, который никто не сверял с сервером.
test('округление цены веса живёт только в lib/price.ts', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const skip = new Set(['node_modules', '.next', 'test-results', 'data']);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(path.join(dir, entry.name)); }
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path.join(dir, entry.name));
    }
  };
  for (const dir of ['app', 'components', 'lib']) walk(path.join(root, dir));
  const offenders = files.filter((file) => path.basename(file) !== 'price.ts')
    .flatMap((file) => priceWeightRounds(fs.readFileSync(file, 'utf8')).map((argument) => `${path.relative(root, file)}: Math.round(${argument})`));
  assert.deepEqual(offenders, [], 'цена по весу считается в обход lib/price.ts');
  const staticHtml = fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8');
  assert.match(staticHtml, /function calcPiecePrice\(weightG, pricePerKg\) \{ return Math\.round\(weightG \* pricePerKg \/ 1000\); \}/,
    'статическая витрина считает отрез по другой формуле');
  assert.deepEqual(priceWeightRounds(staticHtml).filter((argument) => argument !== 'weightG * pricePerKg / 1000'),
    [], 'в статической витрине появилась вторая формула цены веса');
});

// Без этого теста прошлый гейт молчал бы на любой записи формулы: он искал только одну.
test('детектор находит все исторические записи второй формулы', () => {
  const historical = [
    'price = Math.round(weightG * rate / 1000);',
    'const price = Math.round(weightG / 1000 * rate);',
    'return Math.round((weightG / 1000) * product.pricePerKg);',
    'item.price = Math.round(weight * item.pricePerKg / 1000);',
    'price = Math.round(bulkWeight * (product.bulk?.pricePerKg ?? 0) / 1000);',
  ];
  for (const line of historical) assert.deepEqual(priceWeightRounds(line).length, 1, `детектор пропустил: ${line}`);
  assert.deepEqual(priceWeightRounds('assert.equal(calcPricePer100g(6750), Math.round(pricePerKg / 10));'), [], 'детектор ловит расчёт за 100 г');
  assert.deepEqual(priceWeightRounds('return Math.round(weightG * pricePerKg / 1000);'), ['weightG * pricePerKg / 1000'], 'каноническая запись должна находиться');
});