// Условные панели: слайдер веса рендерится только у позиций на развес, а в прайсе 0711
// таких нет, поэтому браузерный обход углов их не видит. Проверяем сами правила.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const sheets = {
  'shop/app/globals.css': [fs.readFileSync(path.join(root, 'app/globals.css'), 'latin1')],
  'index.html': [...fs.readFileSync(path.join(root, '..', 'index.html'), 'latin1').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]),
};

test('панель развеса в обеих витринах объявляет скругление', () => {
  for (const [name, blocks] of Object.entries(sheets)) {
    const rules = blocks.flatMap((css) => [...css.matchAll(/\.bulk-slider-box\s*\{[^}]*\}/g)]);
    assert.ok(rules.length, `${name}: правило .bulk-slider-box отсутствует`);
    for (const rule of rules) {
      assert.match(rule[0], /border-radius\s*:/, `${name}: угол панели развеса не задан`);
    }
  }
});

test('в прайсе 0711 нет позиций на развес — браузерный гейт углов их не покрывает', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(root, 'scripts/price-0711.rows.json'), 'utf8'));
  const withBulk = rows.filter((row) => /развес/i.test(`${row.title} ${row.note}`));
  assert.deepEqual(withBulk.map((row) => row.title), [], 'развес появился: добавить браузерную проверку слайдера веса');
});
