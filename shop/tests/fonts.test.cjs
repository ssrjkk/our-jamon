// Шрифты: ₽ и стрелки лежат не во всех нарезках Geologica/Playfair, а next/font добавляет
// Fallback-семейства без unicode-range, которые перехватывают недостающий глиф локальным Times/Arial.
// Проверяем покрытие нарезок, порядок гарнитур в стеках и что стрелки больше не символы текста.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const RUBLE = 0x20bd;
const ARROWS = /[→↗←]/;

// «U+20A0-20AB,U+20BD» → [[0x20a0, 0x20ab], [0x20bd, 0x20bd]]
const rangesOf = (value) => [...String(value).matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi)]
  .map((m) => [parseInt(m[1], 16), parseInt(m[2] || m[1], 16)]);
const covers = (ranges, codePoint) => ranges.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);

const facesOf = (css, family) => [...css.matchAll(/@font-face\s*\{[^}]*\}/gi)]
  .map((m) => m[0])
  .filter((face) => (face.match(/font-family:\s*['"]?([^;'"]+)/) || [, ''])[1].trim() === family)
  .map((face) => ({
    ranges: rangesOf((face.match(/unicode-range:([^;}]+)/) || [, ''])[1]),
    files: [...face.matchAll(/url\((?:'[^']*'|"([^"]*)"|([^)\s]+))[^\)]*\)/g)].map((m) => m[1] || m[2]),
  }));

const stackOf = (css, token) => {
  const line = (css.match(new RegExp(`${token}:\\s*([^;]+);`)) || [])[1];
  assert.ok(line, `${token} не объявлен`);
  return line.replace(/\s+/g, ' ').trim();
};

// Всё, что может отдать системный глиф: var()-цепочка next/font (в ней Fallback-семейства без
// unicode-range), локальные Georgia/Arial и generic-селекторы.
const SYSTEM_SOURCE = /var\(--font|Georgia|Arial|serif|Fallback/i;

const sheets = {
  'brand/fonts/fonts.css': read('brand/fonts/fonts.css'),
  'index.html': [...read('index.html').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n'),
  'shop/app/globals.css': read('shop/app/globals.css'),
};

test('нарезки Geologica покрывают ₽, и файл с покрытием лежит в репозитории', () => {
  for (const [name, css] of Object.entries(sheets)) {
    const faces = facesOf(css, 'Geologica');
    if (!faces.length) continue; // globals.css делегирует нарезки next/font
    const covered = faces.filter((face) => covers(face.ranges, RUBLE));
    assert.ok(covered.length, `${name}: ни один @font-face Geologica не объявляет coverage для ₽`);
    for (const file of covered.flatMap((face) => face.files)) {
      const abs = path.join(root, 'brand', 'fonts', path.basename(file));
      assert.ok(fs.existsSync(abs), `${name}: ₽ берётся из ${file}, которого нет в brand/fonts`);
    }
  }
});

test('в next/font Geologica включён latin-ext, где живёт ₽', () => {
  const layout = read('shop/app/layout.tsx');
  const block = (layout.match(/Geologica\(\{([\s\S]*?)\}\)/) || [])[1];
  assert.ok(block, 'Geologica не настроен в layout.tsx');
  const subsets = (block.match(/subsets:\s*\[([^\]]*)\]/) || [, ''])[1];
  assert.match(subsets, /latin-ext/, 'без latin-ext гарнитура не отдаёт знак рубля');
});

test('бренд-гарнитуры идут раньше fallback-семейств и Georgia в обоих стеклах', () => {
  for (const [name, css] of Object.entries(sheets)) {
    for (const token of ['--font-serif', '--font-sans']) {
      if (!css.includes(token + ':')) continue;
      const entries = stackOf(css, token).split(', ');
      assert.match(entries[0], /^['"](?:Playfair Display|Geologica)['"]$/, `${name} ${token}: первую позицию занимает не бренд-гарнитура — ${entries[0]}`);
      const geologica = entries.findIndex((entry) => /^['"]Geologica['"]$/.test(entry));
      const system = entries.findIndex((entry) => SYSTEM_SOURCE.test(entry));
      assert.ok(geologica >= 0, `${name} ${token}: в стеке нет Geologica, и ₽ нарисует системный шрифт — ${entries.join(', ')}`);
      if (system >= 0) assert.ok(geologica < system, `${name} ${token}: Geologica стоит после источника системного глифа — ${entries.join(', ')}`);
    }
  }
});

test('стрелки больше не символы текста: в размеченных поверхностях их нет', () => {
  const markup = [
    ['index.html', read('index.html').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '')],
    ['shop/app/page.tsx', read('shop/app/page.tsx')],
    ['shop/app/about/page.tsx', read('shop/app/about/page.tsx')],
    ['shop/app/product/[id]/page.tsx', read('shop/app/product/[id]/page.tsx')],
    ['shop/components/HeroLight.tsx', read('shop/components/HeroLight.tsx')],
    ['shop/components/ShopPanel.tsx', read('shop/components/ShopPanel.tsx')],
    ['shop/components/Stories.tsx', read('shop/components/Stories.tsx')],
  ];
  for (const [name, source] of markup) {
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(withoutComments, ARROWS, `${name}: символьная стрелка нарисована вне бренд-гарнитуры — заменить на масочный значок`);
  }
});

test('масочные стрелки объявлены в обеих таблицах стилей', () => {
  // Тело правила по точному списку селекторов: обычный матч нашёл бы `.arrow-up` внутри
  // общего правила `.arrow, .arrow-up`.
  const bodyOf = (css, selector) => {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const found of clean.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const sel = found[1].slice(found[1].lastIndexOf('}') + 1).trim().replace(/\s+/g, ' ');
      if (sel === selector) return found[2];
    }
    return null;
  };
  for (const [name, css] of Object.entries(sheets)) {
    if (!css.includes('--font-serif')) continue;
    const shared = bodyOf(css, '.arrow, .arrow-up');
    assert.ok(shared, `${name}: нет общего правила .arrow, .arrow-up`);
    assert.match(shared, /background-color:\s*currentColor/, `${name}: значок не наследует цвет текста`);
    assert.match(shared, /(?:^|-)mask:\s*var\(--mask\)/, `${name}: значок не рисуется маской`);
    for (const cls of ['.arrow', '.arrow-up']) {
      const body = bodyOf(css, cls);
      assert.ok(body, `${name}: нет правила ${cls}`);
      assert.match(body, /--mask:\s*url\(/, `${name}: ${cls} не задаёт маску`);
      assert.match(body, /width:/, `${name}: ${cls} без ширины`);
      assert.match(body, /height:/, `${name}: ${cls} без высоты`);
    }
    // Зеркало требуется только той витрине, где стрелка «назад» действительно стоит. В статике её
    // нет, и правило там стало бы мёртвым — это ловит гейт селекторов в storefront.spec.cjs.
    const mirrorUsed = name === 'index.html'
      ? /class="[^"]*arrow-rev/.test(read('index.html'))
      : fs.readdirSync(path.join(root, 'shop/components'), { recursive: true })
        .filter((f) => /\.tsx$/.test(String(f)))
        .some((f) => /className="[^"]*arrow-rev/.test(fs.readFileSync(path.join(root, 'shop/components', String(f)), 'utf8')));
    if (mirrorUsed) assert.match(css, /\.arrow-rev\s*\{[^}]*scaleX\(-1\)/, `${name}: нет зеркала для стрелки назад`);
  }
});

test('витрины тянут стрелки как значки, а не как текст', () => {
  const staticHtml = read('index.html');
  assert.ok((staticHtml.match(/class="arrow(?:-up)?"/g) || []).length >= 5, 'в index.html стало меньше масочных значков');
  for (const rel of ['shop/app/page.tsx', 'shop/app/about/page.tsx', 'shop/app/product/[id]/page.tsx', 'shop/components/HeroLight.tsx', 'shop/components/ShopPanel.tsx', 'shop/components/Stories.tsx']) {
    assert.match(read(rel), /className="arrow/, `${rel}: масочный значок пропал`);
  }
});
