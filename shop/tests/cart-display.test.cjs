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
      assert.equal(summary, qty > 1 ? `${qty}\u00a0шт.` : '');
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

// «Корзина: 2 товаров» вслух звучит как ошибка в данных: покупатель не понимает,
// сколько позиций он добавил. Формы считает одна функция, разметка их не печатает.
test('число позиций согласуется с существительным в одном месте', () => withSystem(async s => {
  const { formatCount } = s.load('components/CartContext.tsx');
  const forms = [[0, 'товаров'], [1, 'товар'], [2, 'товара'], [4, 'товара'], [5, 'товаров'], [11, 'товаров'], [14, 'товаров'], [21, 'товар'], [22, 'товара'], [25, 'товаров'], [101, 'товар'], [111, 'товаров'], [121, 'товар'], [122, 'товара']];
  for (const [count, word] of forms) {
    assert.equal(formatCount(count, 'товар', 'товара', 'товаров'), `${count}\u00A0${word}`, `форма для ${count} не та`);
  }

  const skip = new Set(['node_modules', '.next', 'test-results', 'data']);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(path.join(dir, entry.name)); }
      else if (/\.tsx$/.test(entry.name)) files.push(path.join(dir, entry.name));
    }
  };
  for (const dir of ['app', 'components']) walk(path.join(root, dir));
  const offenders = files.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n')
    .map((line, index) => `${path.relative(root, file)}:${index + 1}: ${line.trim()}`)
    .filter((entry) => /\$\{[^}]*\}\s?товар(а|ы|ов)?\b/.test(entry)));
  assert.deepEqual(offenders, [], 'количество товаров напечатано минуя formatCount — форма числа снова разъедется');
  assert.match(fs.readFileSync(path.join(root, 'components', 'SiteHeader.tsx'), 'utf8'),
    /formatCount\(count, 'товар', 'товара', 'товаров'\)/, 'шапка корзины не использует formatCount');
}));

// Предел упаковок и предел позиций — правило, а не деталь разметки: его держат сервер,
// контрол в корзине, подпись под полем и восстановление из localStorage. Как только
// число записано числом во втором месте, дрейф невидим: кнопка «+» разрешает то, что
// отвергает заказ, а подпись расходится с текстом ошибки.
// Ловятся только формы, в которых предел и бывает: сравнение с количеством, числовой
// min/max контрола, Math.min/max вокруг количества, размер корзины и подпись предела.
// Просто «цифра на строке со словом qty» не годится: в платёжном модуле те же строки
// несут нарезку названия («slice(0, 128)») и перевод рублей в копейки, а это не пределы.
const СРАВНЕНИЕ_КОЛИЧЕСТВА = /(?:\bqty\s*[<>]=?\s*\d{2,}|\b\d{2,}\s*[<>]=?\s*qty\b)/;
const ЧИСЛОВОЙ_КОНТРОЛ = /\b(?:min|max)=\{\d{2,}\}/;
const ЧИСЛОВОЙ_КЛАМП = /Math\.(?:min|max)\([^)]*\d{2,}[^)]*\)/;
const ПРЕДЕЛ_ПОЗИЦИЙ = /(?:inputs|next|cart|lines)\.length\s*>\s*\d{2,}/;
const ЦИФРА_В_ПОДПИСИ = /(?<![\w$}])\d+ (?:одинаковых упаковок|позиций)/;

function пределыЧислом(исходник) {
  const нарушения = [];
  const безКомментариев = исходник
    .replace(/\/\*[\s\S]*?\*\//g, (с) => с.replace(/[^\n]/g, ' '))
    .replace(/^[^\S\n]*\/\/[^\n]*/gm, (с) => с.replace(/[^\n]/g, ' '));
  безКомментариев.split(/\r?\n/).forEach((строка, индекс) => {
    const естьQty = /\bqty\b/.test(строка);
    for (const [правило, рег] of [['сравнение с пределом', СРАВНЕНИЕ_КОЛИЧЕСТВА], ['числовой предел контрола', естьQty ? ЧИСЛОВОЙ_КОНТРОЛ : null], ['кламп предела числом', естьQty ? ЧИСЛОВОЙ_КЛАМП : null], ['предел позиций', ПРЕДЕЛ_ПОЗИЦИЙ], ['предел в подписи', ЦИФРА_В_ПОДПИСИ]]) {
      if (рег?.test(строка)) нарушения.push(`${правило}: ${строка.trim().slice(0, 90)}`);
    }
  });
  return нарушения;
}

test('предел упаковок и позиций не записан числом в обход lib/cart.ts', () => {
  const skip = new Set(['node_modules', '.next', 'test-results', 'data']);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(path.join(dir, entry.name)); }
      else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path.join(dir, entry.name));
    }
  };
  for (const dir of ['app', 'components', 'lib']) walk(path.join(root, dir));
  const offenders = files.filter((file) => path.basename(file) !== 'cart.ts')
    .flatMap((file) => пределыЧислом(fs.readFileSync(file, 'utf8')).map((entry) => `${path.relative(root, file).replace(/\\/g, '/')}:${entry}`));
  assert.deepEqual(offenders, [], `${offenders.length} мест(а) держат предел корзины числом:\n${offenders.join('\n')}`);
  // Детектор обязан видеть заведомое нарушение и не реагировать на перенос правила в
  // константу — включая чужие числа на тех же строках (нарезка названия в платёжном
  // модуле, печать «больше одной штуки»).
  assert.deepEqual(пределыЧислом('if (line.qty > 20) return invalid();\n<input min={1} max={20} value={line.qty} />'),
    ['сравнение с пределом: if (line.qty > 20) return invalid();', 'числовой предел контрола: <input min={1} max={20} value={line.qty} />'],
    'предел, записанный числом в сравнении или в контроле, не пойман');
  assert.deepEqual(пределыЧислом('if (next.length > 100) setNotice("В одном заказе может быть не более 100 позиций.");'),
    ['предел позиций: if (next.length > 100) setNotice("В одном заказе может быть не более 100 позиций.");',
      'предел в подписи: if (next.length > 100) setNotice("В одном заказе может быть не более 100 позиций.");'],
    'предел позиций, записанный числом, не пойман');
  assert.deepEqual(пределыЧислом([
    'const next = clampQuantity(qty);',
    '<span>До {MAX_QTY_PER_LINE} одинаковых упаковок</span>',
    'if (item.qty > 1) parts.push(`${item.qty} шт.`);',
    'Math.min(MAX_QTY_PER_LINE, line.qty)',
    '{ Name: item.title.slice(0, 128), Price: item.price * 100, Quantity: item.qty }',
    'if (customer.name.length > 100) return invalid();',
  ].join('\n')), [], 'детектор ловит правило, вынесенное в константу, или чужие числа рядом с количеством');
});

// Сервер и витрина должны принимать ровно один и тот же диапазон, иначе «Оформить заказ»
// отвечает ошибкой на корзину, которую кнопка «+» позволила собрать.
test('диапазон упаковок один на витрину и сервер', () => withSystem(async s => {
  const { MIN_QTY_PER_LINE, MAX_QTY_PER_LINE, MAX_CART_LINES, clampQuantity, QTY_LIMIT_NOTE, QTY_MAX_NOTICE, QTY_ADD_NOTICE } = s.load('lib/cart.ts');
  const { PRODUCTS } = s.load('lib/products.ts');
  const { resolveCart } = s.load('lib/orders.ts');
  const pack = PRODUCTS.find((product) => product.kind === 'pack' && product.packs.length > 0);
  assert.ok(pack, 'нет ни одной фасовки — проверке предела нечего собирать');
  const line = (qty, packIdx = 0) => [{ productId: pack.id, kind: 'pack', packIdx, qty }];
  const probe = (qty) => resolveCart(line(qty), new Set(), PRODUCTS);

  assert.equal(clampQuantity(Number.NaN), MIN_QTY_PER_LINE, 'пустое поле должно опускаться до минимума');
  assert.equal(clampQuantity(0), MIN_QTY_PER_LINE);
  assert.equal(clampQuantity(-5), MIN_QTY_PER_LINE);
  assert.equal(clampQuantity(-Infinity), MIN_QTY_PER_LINE, 'минус бесконечность уехала в отрицательное количество');
  assert.equal(clampQuantity(MIN_QTY_PER_LINE), MIN_QTY_PER_LINE);
  assert.equal(clampQuantity(2.7), 2, 'дробное должно усекаться, а не округляться вверх');
  assert.equal(clampQuantity(MAX_QTY_PER_LINE), MAX_QTY_PER_LINE);
  assert.equal(clampQuantity(MAX_QTY_PER_LINE + 1), MAX_QTY_PER_LINE);
  assert.equal(clampQuantity(1e9), MAX_QTY_PER_LINE);
  assert.equal(clampQuantity(Infinity), MAX_QTY_PER_LINE, '«1e999» из number-инпута должно упираться в верхний предел, а не в нижний');

  assert.equal(probe(MIN_QTY_PER_LINE).ok, true, 'нижний предел отвергнут сервером');
  assert.equal(probe(MIN_QTY_PER_LINE - 1).ok, false, 'сервер принял количество ниже предела витрины');
  assert.equal(probe(MAX_QTY_PER_LINE).ok, true, 'верхний предел отвергнут сервером');
  assert.equal(probe(MAX_QTY_PER_LINE + 1).ok, false, 'сервер принял количество выше предела витрины');
  assert.equal(probe(2.5).ok, false, 'сервер принял дробное количество');
  assert.match(probe(MAX_QTY_PER_LINE + 1).error, new RegExp(`от ${MIN_QTY_PER_LINE} до ${MAX_QTY_PER_LINE}\\.`), 'текст ошибки называет другие числа');

  // Ровно предел позиций проходит, предел + 1 — нет. Строки разные по фасовке, потому что
  // одинаковые упаковки складываются в одну строку ещё до отправки на сервер.
  const full = Array.from({ length: MAX_CART_LINES }, (_, index) => ({ productId: pack.id, kind: 'pack', packIdx: index % pack.packs.length, qty: 1 }));
  assert.equal(resolveCart(full, new Set(), PRODUCTS).ok, true, `сервер отверг заказ из ${MAX_CART_LINES} позиций`);
  assert.equal(resolveCart([...full, { productId: pack.id, kind: 'pack', packIdx: 0, qty: 1 }], new Set(), PRODUCTS).ok, false,
    `сервер принял ${MAX_CART_LINES + 1} позиций, витрина об этом не предупреждает`);

  assert.equal(QTY_LIMIT_NOTE, `До ${MAX_QTY_PER_LINE} одинаковых упаковок`);
  assert.match(QTY_MAX_NOTICE, new RegExp(String(MAX_QTY_PER_LINE)));
  assert.match(QTY_ADD_NOTICE, new RegExp(String(MAX_QTY_PER_LINE)));
}));

// Молчаливый отказ — это поле, которое показывает число, которого корзина не имеет:
// «21» в поле ввода, 20 в корзине и 20 в чеке. Теперь значение доводится и называется вслух.
test('поле количества не может расходиться с корзиной', () => {
  const context = fs.readFileSync(path.join(root, 'components', 'CartContext.tsx'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'components', 'CartClient.tsx'), 'utf8');
  const orders = fs.readFileSync(path.join(root, 'lib', 'orders.ts'), 'utf8');
  assert.match(context, /const setQuantity = useCallback\(\(uid: string, qty: number\) => \{\s*const next = clampQuantity\(qty\);/,
    'setQuantity не доводит значение через clampQuantity');
  assert.match(context, /if \(next !== qty\) setNotice\(/, 'скорректированное количество не названо вслух');
  assert.doesNotMatch(context, /qty < 1 \|\| qty > 20/, 'setQuantity снова молча отбрасывает ввод вне диапазона');
  assert.match(context, /commit\(current\.current\.map\(\(line\) => line\.uid === uid && line\.kind === 'pack' \? \{ \.\.\.line, qty: next \} : line\)\)/,
    'корзина пишет не скорректированное значение');
  assert.match(client, /min=\{MIN_QTY_PER_LINE\} max=\{MAX_QTY_PER_LINE\}/, 'контрол количества разрешает то, что корзина не примет');
  assert.match(client, /\{QTY_LIMIT_NOTE\}/, 'подпись предела не взята из lib/cart.ts');
  assert.match(orders, /qty < MIN_QTY_PER_LINE \|\| qty > MAX_QTY_PER_LINE/, 'сервер сверяет другую пару чисел');
});
