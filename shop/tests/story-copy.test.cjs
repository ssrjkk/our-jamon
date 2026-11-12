// Кольца историй пересказывают состав наборов из прайса: правка набора без правки
// текста оставляет обещание товара, которого в корзине нет. Гейт сверяет выдержку,
// названную в тексте, с agingMonths реальной позиции набора на обеих витринах.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./helpers.cjs');
const catalog = require('../lib/catalog.json');

const nextSource = fs.readFileSync(path.join(root, 'components/Stories.tsx'), 'utf8');
const staticHtml = fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8');
const agingClaims = (text) => [...text.matchAll(/Нарезка «(\d+)»/g)].map((claim) => Number(claim[1]));

const kit = catalog.kits.find((entry) => entry.id === 'evening');
assert.ok(kit, 'в прайсе не осталось набора evening — гейту не с чем сверяться');
const sliced = kit.items
  .map((item) => catalog.products.find((product) => product.id === item.productId))
  .filter((product) => product && /нарезка/i.test(product.title));
assert.equal(sliced.length, 1, `в наборе evening должна быть одна нарезка, найдено ${sliced.length}`);

test('история «К столу» обещает выдержку, которая реально лежит в наборе', () => {
  assert.ok(kit.items.some((item) => catalog.products.find((p) => p.id === item.productId)?.title.includes('GORDAL')),
    'набор evening больше не с оливками Gordal — правь текст истории вместе с прайсом');
  assert.deepEqual([...new Set(agingClaims(nextSource))], [sliced[0].agingMonths],
    `Next: текст истории про набор evening не совпадает с каталогом (${sliced[0].title}, ${sliced[0].agingMonths} мес.)`);
});

// В статической витрине набор описан дважды (карточка набора и кольцо истории),
// поэтому сверяется множество названных выдержек, а не их количество.
test('обе витрины обещают одну и ту же выдержку в наборе «К столу»', () => {
  assert.deepEqual([...new Set(agingClaims(staticHtml))], [...new Set(agingClaims(nextSource))],
    'статическая и Next-витрина разошлись в составе набора evening');
});
