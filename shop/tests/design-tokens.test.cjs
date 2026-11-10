// Контракт токенов двух витрин: бренд один, поэтому цвета, радиус и эффекты обязаны совпадать,
// а сырых цветов вне :root быть не должно. Расхождения ниже — только задокументированные.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(file, 'utf8');
const nextCss = read(path.join(root, 'app/globals.css'));
const staticCss = [...read(path.join(root, '..', 'index.html')).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const sheets = { 'globals.css': nextCss, 'index.html': staticCss };

const rootTokens = (css) => {
  const block = (/:root\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
  const out = new Map();
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
};
const tokens = Object.fromEntries(Object.entries(sheets).map(([name, css]) => [name, rootTokens(css)]));
const BRAND = ['--paper-salt', '--fat-white', '--hoof-graphite', '--graphite-muted', '--cured-ruby',
  '--cured-ruby-hover', '--bone-line', '--surface-tint', '--error-red', '--brine-olive', '--brine-olive-soft',
  '--radius', '--scrim', '--scrim-story', '--lift-shadow', '--tap-tint'];

test('брендовые токены и эффекты совпадают в обеих витринах посимвольно', () => {
  for (const name of BRAND) {
    const a = tokens['globals.css'].get(name);
    const b = tokens['index.html'].get(name);
    assert.ok(a, `globals.css: нет токена ${name}`);
    assert.equal(b, a, `${name}: index.html=${b} globals.css=${a}`);
  }
});

test('ширина контейнера одна, а высота шапки берётся из токена, а не из магического числа', () => {
  assert.equal(tokens['index.html'].get('--container'), tokens['globals.css'].get('--container'));
  for (const [name, css] of Object.entries(sheets)) {
    const header = (/\.header-inner\s*\{([^}]*)\}/.exec(css) || [])[1] || '';
    assert.match(header, /min-height:\s*var\(--header-h\)/, `${name}: шапка дублирует высоту числом`);
    assert.ok(tokens[name].get('--header-h'), `${name}: нет --header-h`);
  }
});

test('шрифты названы одинаково, различается только механизм подключения', () => {
  // Движок получает семьи через next/font (var(--font-*)), бумажная витрина — через @font-face.
  for (const [name, css] of Object.entries(sheets)) {
    const t = rootTokens(css);
    assert.match(t.get('--font-serif'), /playfair/i, `${name}: serif не Playfair`);
    assert.match(t.get('--font-serif'), /Georgia, serif/, `${name}: нет страховочной семьи`);
    assert.match(t.get('--font-sans'), /geologica/i, `${name}: sans не Geologica`);
    assert.match(t.get('--font-sans'), /Arial, sans-serif/, `${name}: нет страховочной семьи`);
  }
});

test('вне :root нет сырых цветов ни в одной витрине', () => {
  for (const [name, css] of Object.entries(sheets)) {
    const body = css.replace(/:root\s*\{[^}]*\}/g, '');
    const raw = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla)\([^)]*\)/g)].map((m) => m[0]);
    assert.deepEqual(raw, [], `${name}: сырые цвета вне токенов`);
  }
});

test('затемнение шторок и плеера историй идёт через токены scrim', () => {
  for (const [name, css] of Object.entries(sheets)) {
    for (const selector of ['.menu-backdrop', '.stories-player']) {
      const rule = (new RegExp(selector.replace('.', '\\.') + '\\s*\\{([^}]*)\\}').exec(css) || [])[1] || '';
      assert.ok(rule, `${name}: нет правила ${selector}`);
      assert.match(rule, /var\(--scrim(-story)?\)/, `${name}: ${selector} затемняет сырым цветом`);
    }
  }
  const cart = (/\.cart-backdrop\s*\{([^}]*)\}/.exec(staticCss) || [])[1] || '';
  assert.match(cart, /var\(--scrim\)/, 'index.html: подложка корзины без токена');
});

test('тёмная секция весов собрана из токенов, а ползунок виден на тёмном фоне', () => {
  const panel = (/\.scale-panel\s*\{([^}]*)\}/.exec(staticCss) || [])[1] || '';
  assert.match(panel, /border:\s*1px solid var\(--graphite-muted\)/, 'index.html: рамка весов не из токена');
  const range = (/\.scale-range-wrap input\[type="range"\]\s*\{([^}]*)\}/.exec(staticCss) || [])[1] || '';
  assert.match(range, /accent-color:\s*var\(--paper-salt\)/, 'index.html: рубиновый ползунок не читается на тёмном');
  const pressed = (/\.magnet-btn\[aria-pressed="true"\]\s*\{([^}]*)\}/.exec(staticCss) || [])[1] || '';
  assert.match(pressed, /background-color:\s*var\(--paper-salt\)/, 'index.html: нажатый магнит не отличим от фона');
});

test('шкала радиусов одна: контролы не живут на отдельном токене', () => {
  assert.equal(tokens['index.html'].has('--radius-control'), false, 'index.html: вторая шкала радиусов');
  // Круг, пилюля и бегунок скроллбра — намеренная геометрия, а не дрейф.
  const allowed = new Set(['0', '50%', '999px', '5px', 'var(--radius)']);
  for (const [name, css] of Object.entries(sheets)) {
    for (const m of css.matchAll(/border-radius\s*:\s*([^;]+);/g)) {
      for (const part of m[1].trim().split(/\s+/)) {
        assert.ok(allowed.has(part), `${name}: радиус вне шкалы — ${part}`);
      }
    }
  }
});

test('в разметке бумажной витрины нет inline-цветов', () => {
  const html = read(path.join(root, '..', 'index.html'));
  const colored = [...html.matchAll(/style="[^"]*"/g)].map((m) => m[0]).filter((s) => /color\s*:|background/.test(s));
  assert.deepEqual(colored, [], 'index.html: цвет задан инлайном вместо класса');
});
