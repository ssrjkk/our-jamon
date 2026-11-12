// Фасовки с объёмом вместо веса (оливки, масло, аксессуары) лежат в прайсе с weightG = 0.
// Корзина, страница заказа и админка печатали «0 г за шт.» — гейт собирает строки
// из реального каталога и не даёт правилу о нулевом весе разползтись по файлам.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSystem, root } = require('./helpers.cjs');

async function withSystem(action, options) {
  const system = createSystem(options);
  try { await action(system); } finally { system.cleanup(); }
}

test('фасовка без граммов не печатает «0 г» ни в одной конфигурации каталога', () => withSystem(async s => {
  const { PRODUCTS } = s.load('lib/products.ts');
  const { resolveCart } = s.load('lib/orders.ts');
  const { formatUnitSummary } = s.load('components/CartContext.tsx');
  const volumePacks = [];
  for (const product of PRODUCTS) product.packs.forEach((pack, packIdx) => { if (pack.weightG === 0) volumePacks.push({ product, packIdx }); });
  assert.ok(volumePacks.length >= 40, `объёмных фасовок осталось ${volumePacks.length} — проверь, что кейс не выпал из гейта`);
  for (const { product, packIdx } of volumePacks) {
    for (const qty of [1, 2]) {
      const resolved = resolveCart([{ productId: product.id, kind: 'pack', packIdx, qty }], new Set(), PRODUCTS);
      assert.equal(resolved.ok, true, `${product.id}: сервер отверг фасовку ${packIdx}`);
      const summary = formatUnitSummary(resolved.items[0]);
      assert.ok(!/(^|\D)0[\u00a0 ]г/.test(summary), `${product.id} × ${qty}: в корзине читается «${summary}»`);
      assert.equal(summary, qty > 1 ? `${qty} шт.` : '');
    }
  }
  const cut = PRODUCTS.find((product) => product.kind === 'piece' && product.category === 'piece');
  const weighed = resolveCart([{ productId: cut.id, kind: 'custom', weightG: 350, qty: 1 }], new Set(), PRODUCTS).items[0];
  assert.equal(formatUnitSummary(weighed), '350\u00a0г за шт.');
}));

test('идентификатор строки корзины есть и без защищённого контекста', () => withSystem(async s => {
  const { newLineUid } = s.load('components/CartContext.tsx');
  assert.match(newLineUid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'в https должен звучать настоящий UUID');
  const real = globalThis.crypto;
  try {
    globalThis.crypto = {};
    const ids = [newLineUid(), newLineUid()];
    for (const id of ids) {
      assert.ok(id.length >= 12, `запас идентификатора слишком короткий: «${id}»`);
      assert.doesNotMatch(id, /undefined|NaN/, 'запас идентификатора собран из пустых значений');
    }
    assert.equal(new Set(ids).size, 2, 'запас идентификатора повторяется и строки корзины слипнутся');
  } finally {
    globalThis.crypto = real;
  }
}));

test('правило нулевого веса живёт в одном месте, а не в каждой разметке', () => {
  const skip = new Set(['node_modules', '.next', 'test-results', 'data']);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(path.join(dir, entry.name)); }
      else if (/\.tsx$/.test(entry.name)) files.push(path.join(dir, entry.name));
    }
  };
  for (const dir of ['app', 'components']) walk(path.join(root, dir));
  const offenders = files.filter((file) => path.basename(file) !== 'CartContext.tsx').flatMap((file) => fs.readFileSync(file, 'utf8').split('\n')
    .map((line, index) => `${path.relative(root, file)}:${index + 1}: ${line.trim()}`)
    .filter((entry) => /за шт\./.test(entry) && !/weightG > 0/.test(entry)));
  assert.deepEqual(offenders, [], 'строка «за шт.» напечатана без проверки нулевого веса');
});
