// Полный прогон 2026-11-13 упал на гейте движения: клик «В корзину» ушёл в пустоту, потому
// что React навешивает обработчики в самом конце гидратации, а серверный HTML к этому моменту
// уже отрисован и выглядит готовым (toBeEnabled() этого не ловит). Починка — ожидание
// гидратации в tests/e2e/helpers.cjs. Чтобы она не растворилась в следующем свипе, этот гейт
// требует: ни один клик по React-контролу в browser-тестах не стоит без готовККлику перед ним.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./helpers.cjs');

const e2eDir = path.join(root, 'tests/e2e');
const read = (file) => fs.readFileSync(path.join(e2eDir, file), 'utf8').replace(/\r\n/g, '\n');
const helperSource = read('helpers.cjs');
const specs = fs.readdirSync(e2eDir).filter((file) => file.endsWith('.spec.cjs')).map(read);

// Контролы, чей эффект даёт только уже загидратированный React: добавление в корзину,
// добавление набора, оформление заказа. Имена и селекторы взяты из вёрстки, не выдуманы.
const ЗАЩИТА = [
  [/В корзину/, 'добавление в корзину'],
  [/Добавить весь набор/, 'добавление набора'],
  [/Оформить демо-заказ/, 'оформление заказа'],
  [/product-detail-card \.add-btn/, 'кнопка «В корзину» в карточке Next'],
];
const ИМЯ = '[A-Za-z_$\\u0401\\u0410-\\u044f\\u0451]+';
const kindOf = (line) => {
  const hit = ЗАЩИТА.find(([pattern]) => pattern.test(line));
  return hit ? hit[1] : null;
};
const КЛИК = new RegExp(`await (${ИМЯ})\\.click\\(\\)`, 'g');

/**
 * Разбор по строкам. Объявление `const add = page.getByRole('button', { name: /В корзину/ })`
 * связывает переменную с защищённым контролом; дальше каждый `await add.click()` требует,
 * чтобы выше в этом же теле теста стоял `await готовККлику(add, …)`. Граница теста сбрасывает
 * и связи, и готовость, как и любая навигация: после goto или reload страница загидратирована
 * заново, и прошлый признак к новому элементу не относится.
 * Клик, написанный цепочкой локаторов, переменной не принадлежит и ждать его некому,
 * поэтому он запрещён сразу.
 */
function нарушения(исходник) {
  const проблемы = [];
  const protectedVars = new Map();
  const waited = new Set();
  исходник.split('\n').forEach((line, index) => {
    if (/^\s*(?:for \(.*\) \{ )?test\(/.test(line)) {
      protectedVars.clear();
      waited.clear();
      return;
    }
    if (/\.goto\(|\.reload\(/.test(line)) {
      waited.clear();
      return;
    }
    const declared = line.match(new RegExp(`(?:const|let) (${ИМЯ}) =`));
    if (declared && kindOf(line)) protectedVars.set(declared[1], kindOf(line));
    const wait = line.match(new RegExp(`await готовККлику\\(\\s*(${ИМЯ})\\s*,`));
    if (wait) {
      waited.add(wait[1]);
      return;
    }
    if (kindOf(line) && /\.click\(\)/.test(line)) {
      проблемы.push(`${index + 1}: ${kindOf(line)} — клик цепочкой локаторов, его нечем ждать: ${line.trim()}`);
      return;
    }
    for (const click of line.matchAll(КЛИК)) {
      const kind = protectedVars.get(click[1]);
      if (kind && !waited.has(click[1])) {
        проблемы.push(`${index + 1}: ${kind} — перед кликом нет await готовККлику(${click[1]}, …): ${line.trim()}`);
      }
    }
  });
  return проблемы;
}

test('каждый клик по React-контролу дожидается гидратации', () => {
  const found = specs.map((source) => нарушения(source)).flat();
  assert.deepEqual(found, [], `клики без ожидания гидратации:\n${found.join('\n')}`);
});

test('детектор не пустой: заведомая потеря гидратации поймана', () => {
  const цепочкой = [
    "test('a', async ({ page }) => {",
    "  await page.getByRole('button', { name: /В корзину/ }).click();",
    '});',
  ].join('\n');
  assert.equal(нарушения(цепочкой).length, 1, 'клик цепочкой локаторов не пойман');

  const безОжидания = [
    "test('a', async ({ page }) => {",
    "  await page.goto('/product/x');",
    "  const add = page.getByRole('button', { name: /В корзину/ });",
    '  await add.click();',
    '});',
  ].join('\n');
  assert.equal(нарушения(безОжидания).length, 1, 'клик без готовККлику не пойман');

  const защищено = [
    "test('a', async ({ page }) => {",
    '  await добавитьВКорзину(page);',
    "  const add = page.getByRole('button', { name: 'Оформить демо-заказ' });",
    "  await готовККлику(add, 'оформление');",
    '  await add.click();',
    '});',
  ].join('\n');
  assert.deepEqual(нарушения(защищено), [], 'заведомо защищённый клик помечен как нарушающий');

  const послеНавигации = [
    "test('a', async ({ page }) => {",
    '  await page.reload();',
    "  const add = page.getByRole('button', { name: /В корзину/ });",
    '  await add.click();',
    '});',
  ].join('\n');
  assert.equal(нарушения(послеНавигации).length, 1, 'готовность пережила reload');

  const новаяВетка = [
    "test('a', async ({ page }) => {",
    "  const add = page.getByRole('button', { name: /В корзину/ });",
    '  await add.click();',
    '});',
  ].join('\n');
  assert.equal(нарушения(новаяВетка).length, 1, 'клик без ожидания в отдельном теле не пойман');

  // Статическая витрина вне правила: её обработчики навешивает inline-скрипт на
  // DOMContentLoaded (index.html:2378, документная делегация — index.html:2393), а load,
  // которого дожидается page.goto, наступает после DOMContentLoaded всегда.
  const бумажная = [
    "test('a', async ({ page }) => {",
    '  await page.locator(\'[data-action="add-to-cart"][data-product-id="x"]\').click();',
    "  await card.locator('.add-btn').click();",
    '  await page.locator(\'#submit-order-btn\').click();',
    '});',
  ].join('\n');
  assert.deepEqual(нарушения(бумажная), [], 'статический клик попал под правило Next-гидратации');
});

test('признак готовности наблюдаемый, а не гадалка', () => {
  assert.ok(helperSource.includes('__react'), 'helpers.cjs больше не проверяет React-пропсы контрола');
  assert.match(helperSource, /expect\.poll/, 'ожидание гидратации стало фиксированной задержкой');
  assert.ok(/timeout: 20000/.test(helperSource), 'бюджет ожидания гидратации уехал с 20 с');
  const добавление = helperSource.slice(helperSource.indexOf('async function добавитьВКорзину'));
  assert.match(добавление, /await готовККлику\(контрол, метка\);\n  await контрол\.click\(\);/,
    `между ожиданием и кликом в добавитьВКорзину встал код, который мог бы снять готовность:\n${добавление}`);
});

test('спеки берут помощь из helpers.cjs, а не объявляют её у себя', () => {
  for (const file of fs.readdirSync(e2eDir).filter((name) => name.endsWith('.spec.cjs'))) {
    const source = read(file);
    const used = ['готовККлику', 'добавитьВКорзину'].filter((name) => source.includes(`await ${name}(`) || source.includes(`${name}(page`));
    if (!used.length) continue;
    const imported = source.match(/const \{([^}]*)\} = require\('\.\/helpers\.cjs'\)/);
    assert.ok(imported, `${file}: вызывает ${used.join(', ')}, но не подключает helpers.cjs`);
    for (const name of used) {
      assert.ok(imported[1].includes(name), `${file}: ${name} вызывается без импорта из helpers.cjs`);
      assert.ok(!source.includes(`async function ${name}(`),
        `${file}: ${name} объявлен локально — признак готовности разойдётся с helpers.cjs`);
    }
  }
});

test('у гейта есть на чём считать', () => {
  const clicks = specs.reduce((sum, source) => sum + [...source.matchAll(КЛИК)].length, 0);
  const waited = specs.reduce((sum, source) => sum + [...source.matchAll(/await готовККлику\(/g)].length, 0);
  const throughHelper = specs.reduce((sum, source) => sum + [...source.matchAll(/await добавитьВКорзину\(/g)].length, 0);
  assert.ok(clicks >= 10, `клик-переменных в спеках осталось меньше десяти: ${clicks}`);
  assert.ok(waited + throughHelper >= 10,
    `защищённых кликов (ожидание ${waited} + хелпер ${throughHelper}) меньше десяти — гейт потерял опору`);
  assert.ok(helperSource.includes('async function готовККлику'), 'готовККлику исчез из helpers.cjs');
});
