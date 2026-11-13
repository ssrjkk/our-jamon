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

// 404 публикуется отдельным файлом и не проходит через сборки index.html: без этого гейта
// правка бренда ушла бы из неё незаметно, а Pages отдавал бы серую заглушку GitHub.
test('страница 404 живёт в тех же токенах, что и витрина', () => {
  const html = read(path.join(root, '..', '404.html'));
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const notFound = rootTokens(css);
  for (const name of BRAND) {
    assert.equal(notFound.get(name), tokens['index.html'].get(name), `404.html: ${name} разошёлся с index.html`);
  }
  assert.match(css, /\.btn-primary\s*\{[^}]*border-radius:\s*var\(--radius\)/, '404.html: кнопка не берёт радиус из токена');
  assert.match(css, /:focus-visible\s*\{[^}]*outline:/, '404.html: нет видимого фокуса');
  assert.doesNotMatch(css.replace(/:root\s*\{[^}]*\}/g, ''), /rgb\(|#[0-9a-f]{3,8}/i, '404.html: цвет задан числом вне :root');
  assert.doesNotMatch(html, /style="/, '404.html: инлайновые стили вместо классов');
  assert.match(html, /<meta name="robots" content="noindex">/, '404 индексируется');
});

test('окно связи сохраняет одинаковые контролы и типографику обеих витрин', () => {
  for (const selector of ['.contact-trigger', '.contact-panel', '.contact-head h2', '.contact-close', '.contact-description', '.contact-panel .contact-link']) {
    const pattern = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
    const next = pattern.exec(nextCss)?.[1];
    const staticStyle = pattern.exec(staticCss)?.[1];
    assert.ok(next, `${selector}: нет стиля в Next`);
    assert.equal(staticStyle, next, `${selector}: окно связи разошлось между витринами`);
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

// Класс в разметке без правила рисуется обычным текстом — именно так сообщение
// «Неверный пароль» было неотличимо от подписи под полем. Сверяем обе таблицы стилей
// с тем, что витрины реально используют: дрейф в любую сторону значит, что из одной
// разметки собираются две разные страницы.
const styleClasses = (css) => new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

const nextMarkup = () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name)) files.push(read(full));
    }
  };
  for (const dir of ['app', 'components']) walk(path.join(root, dir));
  return files;
};

const classesOf = (text, pattern) => {
  const out = new Set();
  for (const m of text.matchAll(pattern)) for (const cls of m[1].split(/\s+/).filter(Boolean)) out.add(cls);
  return out;
};

test('ни одна витрина не использует класс, которого нет в её таблице стилей', () => {
  const styledNext = styleClasses(nextCss);
  const styledStatic = styleClasses(staticCss);
  const usedNext = new Set();
  for (const text of nextMarkup()) {
    classesOf(text, /className="([a-zA-Z][\w -]*)"/g).forEach((c) => usedNext.add(c));
    classesOf(text, /className=\{`([a-zA-Z][\w -]*)`\}/g).forEach((c) => usedNext.add(c));
  }
  const usedStatic = new Set();
  for (const m of read(path.join(root, '..', 'index.html')).matchAll(/class="([a-zA-Z][\w -]*)"/g)) {
    for (const cls of m[1].split(/\s+/).filter(Boolean)) usedStatic.add(cls);
  }
  assert.ok(usedNext.size >= 200, `классов в разметке Next стало ${usedNext.size} — свип теряет опору`);
  assert.ok(usedStatic.size >= 180, `классов в разметке статики стало ${usedStatic.size} — свип теряет опору`);
  const молчитNext = [...usedNext].filter((c) => styledStatic.has(c) && !styledNext.has(c)).sort();
  const молчитСтатика = [...usedStatic].filter((c) => styledNext.has(c) && !styledStatic.has(c)).sort();
  assert.deepEqual(молчитNext, [], 'Next использует класс, стилизованный в статике, но в globals.css для него нет правила');
  assert.deepEqual(молчитСтатика, [], 'статика использует класс, стилизованный в Next, но в её <style> нет правила');
});

// Предыдущий гейт сверяет таблицы стилей между собой и молчит про класс, которого нет
// ни в одной из них: разметка панели лавки и страницы заказа существовала без единого
// правила, и `* { margin: 0 }` склеил её в одну простыню. Здесь опора — только globals.css,
// поэтому проверка ловит и новый контейнер без стиля, и удалённое правило.
test('каждый класс Next-разметки имеет правило в globals.css', () => {
  const styled = styleClasses(nextCss);
  const used = new Set();
  for (const text of nextMarkup()) {
    classesOf(text, /className="([a-zA-Z][\w -]*)"/g).forEach((c) => used.add(c));
    classesOf(text, /className=\{`([a-zA-Z][\w -]*)`\}/g).forEach((c) => used.add(c));
  }
  assert.ok(used.size >= 200, `классов в Next-разметке стало ${used.size} — свип теряет опору`);
  const silent = [...used].filter((c) => !styled.has(c)).sort();
  assert.deepEqual(silent, [], 'эти классы Next-разметки не имеют ни одного правила в globals.css');
});

// Отдельно про сообщения об ошибках: static-витрина их не знает (у неё статус-бокс),
// поэтому предыдущий гейт их не видит, а покупатель судит о невалидном поле по цвету.
test('сообщение role="alert" имеет правило, а инлайн-ошибка красится токеном ошибки', () => {
  const alertClasses = new Set();
  for (const text of nextMarkup()) {
    for (const m of text.matchAll(/className="([a-zA-Z][\w -]*)"[^>]*role="alert"|role="alert"[^>]*className="([a-zA-Z][\w -]*)"/g)) {
      for (const cls of (m[1] || m[2]).split(/\s+/).filter(Boolean)) alertClasses.add(cls);
    }
  }
  assert.ok(alertClasses.size >= 3, `классов сообщений об ошибке стало ${alertClasses.size} — свип теряет опору`);
  const styledNext = styleClasses(nextCss);
  assert.deepEqual([...alertClasses].filter((c) => !styledNext.has(c)).sort(), [],
    'сообщение об ошибке выводится стилем обычного текста');
  assert.match(nextCss, /\.field-error\s*\{[^}]*color:\s*var\(--error-red\)/,
    'globals.css: .field-error не задан цветом ошибки — сообщение неотличимо от подсказки');
});
