// Витрина не имеет права показывать «незаполненный шаблон»: у позиции без фото из прайса
// кадр рисуется ярлыком выдержки — крупной цифрой срока. Гейт держит три контракта:
// генератор data-URI (однажды Chrome посчитал naturalWidth по умолчанию, и гейт
// «фото не растягиваются» поймал это в e2e — здесь причина держится в корне),
// выбор кадра на всей выгрузке каталога и паритет сведений о выдержке в обеих витринах.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { root } = require('./helpers.cjs');

const staticHtml = fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8');
const staticCss = [...staticHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lib', 'catalog.json'), 'utf8'));

/** Функция вырезается по балансу скобок — тот же приём, что в catalog-parity. */
function staticFunction(name) {
  const marker = 'function ' + name + '(';
  const start = staticHtml.indexOf(marker);
  assert.ok(start >= 0, `в index.html нет функции ${name} — гейт потерял опору`);
  let depth = 0;
  let i = staticHtml.indexOf('{', start);
  for (; i < staticHtml.length; i += 1) {
    if (staticHtml[i] === '{') depth += 1;
    else if (staticHtml[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return staticHtml.slice(start, i + 1);
}

/** Массив вырезается по балансу квадратных скобок. */
function staticArray(name) {
  const start = staticHtml.indexOf(`var ${name} =`);
  assert.ok(start >= 0, `в index.html нет массива ${name} — гейт потерял опору`);
  const open = staticHtml.indexOf('[', start);
  let depth = 0;
  for (let i = open; i < staticHtml.length; i += 1) {
    if (staticHtml[i] === '[') depth += 1;
    else if (staticHtml[i] === ']') { depth -= 1; if (depth === 0) return vm.runInNewContext(`(${staticHtml.slice(open, i + 1)})`, Object.create(null), { timeout: 5000 }); }
  }
  assert.fail(`массив ${name} в index.html не закрыт`);
}

const sandboxCode = [
  staticFunction('calcPricePer100g'),
  staticFunction('formatRub'),
  staticFunction('formatWeightLabel'),
  staticFunction('escapeHtml'),
  staticFunction('averageWeight'),
  staticFunction('productAges'),
  staticFunction('categoryTitle'),
  staticFunction('agingPlateSrc'),
  staticFunction('productArt'),
  'var DEPT_ORDER = ' + JSON.stringify(staticArray('DEPT_ORDER')) + ';',
].join('\n');
const sandbox = vm.createContext({});
vm.runInContext(sandboxCode, sandbox, { timeout: 5000 });

const PLATE_PAPER = { young: '#F4EDDE', mid: '#F0E4CA', deep: '#EBDCBE' };
const PLATE_PALETTE = new Set([PLATE_PAPER.young, PLATE_PAPER.mid, PLATE_PAPER.deep, '#E7DEC9', '#5B2824', '#6E6155']);

const decodePlate = (months) => {
  const uri = vm.runInContext(`agingPlateSrc(${months})`, sandbox, { timeout: 5000 });
  assert.match(uri, /^data:image\/svg\+xml,/, `${months}: кадр не data-URI`);
  const body = decodeURIComponent(uri.slice(uri.indexOf(',') + 1));
  return { uri, body };
};

test('ярлык выдержки — самодостаточный квадрат с числом срока и подписью', () => {
  for (const months of [8, 10, 12, 14, 16, 18, 20, 22, 24]) {
    const { body } = decodePlate(months);
    assert.match(body, /viewBox="0 0 400 400"/, `${months}: не квадрат сетки фото`);
    // Внутренний размер — источник naturalWidth: img-атрибуты на него не влияют, и как-то
    // посчитанный Chrome по умолчанию ловил гейт «фото не растягиваются» (naturalWidth 151).
    assert.match(body, /<svg[^>]*width="800" height="800"/, `${months}: SVG без внутреннего размера`);
    assert.ok(body.includes(`>${months}<`), `${months}: числа срока нет в кадре`);
    assert.ok(body.includes('месяцев выдержки'), `${months}: подпись срока потеряна`);
  }
});

test('data-URI ярлыка не содержит сырого решётчатого фрагмента', () => {
  for (const months of [8, 16, 24]) {
    const { uri } = decodePlate(months);
    const body = uri.slice(uri.indexOf(',') + 1);
    assert.doesNotMatch(body, /#/, `${months}: сырой # внутри data-URI — браузер отрежет хвост как фрагмент`);
  }
});

test('бумага ярлыка темнеет к гран-резерва: три полосы выдержки', () => {
  const bands = [[8, PLATE_PAPER.young], [13, PLATE_PAPER.young], [14, PLATE_PAPER.mid], [19, PLATE_PAPER.mid], [20, PLATE_PAPER.deep], [24, PLATE_PAPER.deep]];
  for (const [months, expected] of bands) {
    const { body } = decodePlate(months);
    assert.ok(body.includes(`fill="${expected}"`), `${months}: ожидается бумага ${expected}, в кадре её нет`);
  }
});

test('ярлык называет полосу той же лексикой, что и «Про выдержку»', () => {
  const bands = [[8, 'Bodega'], [12, 'Bodega'], [14, 'Reserva'], [22, 'Reserva'], [24, 'Gran Reserva'], [28, 'Gran Reserva']];
  for (const [months, band] of bands) {
    const { body } = decodePlate(months);
    assert.ok(body.includes(`>${band}</text>`), `${months}: в ярлыке нет полосы ${band}`);
  }
  for (const months of [8, 16, 24]) {
    const { body } = decodePlate(months);
    assert.match(body, /font-style="italic"/, `${months}: полоса не курсивом — редакционный голос теряется`);
  }
});

test('в ярлыке только цвета бренда: никаких сырых оттенков мимо палитры', () => {
  for (const months of [8, 14, 20]) {
    const { body } = decodePlate(months);
    for (const raw of body.match(/#[0-9a-fA-F]{6}/g) || []) {
      assert.ok(PLATE_PALETTE.has(raw.toUpperCase()), `${months}: цвет ${raw} вне палитры ярлыка`);
    }
  }
});

test('кадр выбирается честно: фото — фото, срок — ярлык, остальное — марка категории', () => {
  const withPhoto = vm.runInContext(`productArt({ id: 'x', title: 'Позиция', category: 'cheese', agingMonths: null, pieces: [], packs: [], image: 'img/nf-00000055.webp', imageW: 488, imageH: 416 })`, sandbox, { timeout: 5000 });
  assert.match(withPhoto, /class="product-photo"/, 'позиция с фото не получила фотографий');
  assert.match(withPhoto, /src="img\/nf-00000055\.webp"/, 'фото не подставлено в src');
  const aged = vm.runInContext(`productArt({ id: 'x', title: 'Кусок', category: 'piece', agingMonths: 16, pieces: [], packs: [] })`, sandbox, { timeout: 5000 });
  assert.match(aged, /class="age-plate"/, 'позиция со сроком без фото не получила ярлык');
  const plain = vm.runInContext(`productArt({ id: 'x', title: 'Соломка', category: 'sliced', agingMonths: null, pieces: [], packs: [] })`, sandbox, { timeout: 5000 });
  assert.match(plain, /card-engraving/, 'позиция без срока и фото осталась без марку категории');
  assert.match(plain, /product-origin/, 'позиция без срока и фото осталась без отдела');
});

test('на всей выгрузке нет ни одной пустой коробки: каждая позиция получает кадр', () => {
  const entries = [...catalog.products, ...catalog.previews];
  assert.ok(entries.length >= 200, `выгрузка обедняла: ${entries.length} позиций`);
  for (const entry of entries) {
    const art = vm.runInContext(`productArt(${JSON.stringify({ ...entry, imageUrl: undefined })})`, sandbox, { timeout: 5000 });
    const hasFrame = /<img/.test(art) || /<div/.test(art);
    assert.ok(hasFrame, `${entry.id}: кадр пуст — витрина покажет заглушку-пустоту`);
    if (!entry.image && entry.agingMonths) {
      assert.match(art, /class="age-plate"/, `${entry.id}: позиция со сроком без фото обязана получить ярлык`);
      assert.match(art, /data:image\/svg\+xml,/, `${entry.id}: ярлык без data-URI`);
    }
  }
});

test('движок не молчит по выдержке там, где статика рисует ярлык', () => {
  const sys = require('./helpers.cjs').createSystem({});
  try {
    const { ProductArt } = sys.load('components/Art.tsx');
    const { renderToStaticMarkup } = require('react-dom/server');
    const entries = [...catalog.products, ...catalog.previews].filter((entry) => !entry.image && entry.agingMonths);
    assert.ok(entries.length >= 10, 'позиций со сроком без фото стало слишком мало — сверять паритет не с чем');
    for (const entry of entries) {
      const markup = renderToStaticMarkup(React.createElement(ProductArt, { product: entry }));
      assert.ok(markup.includes(String(entry.agingMonths)), `${entry.id}: в движке нет числа срока, в статике ярлык есть — витрины расходятся`);
    }
  } finally {
    sys.cleanup();
  }
});

// Слой под `display: none` браузер грузит наравне с видимым: пока шторка закрыта, её
// первый кадр всё равно уходил в сеть — 112 КБ на каждой главной, потраченные на картинку,
// которую никто не открыл. Контракт держим по форме источника: движок монтирует кадр при
// `open`, статика оставляет слот пустым и заполняет его только из навигации по шторке.
test('кадр шторки не грузится, пока шторка закрыта', () => {
  const stories = fs.readFileSync(path.join(root, 'components', 'Stories.tsx'), 'utf8');
  assert.match(stories, /\{open \? STORY_ART\[story\.id\] : null\}/,
    'движок вернул безусловный монтаж кадра — закрытая шторка снова тянет полный кадр до первого клика');
  assert.match(staticHtml, /<div class="story-visual" id="story-visual"[^>]*><\/div>/,
    'статика печатает кадр прямо в разметке — слот обязан стартовать пустым');
  assert.match(staticFunction('renderStory'), /getElementById\('story-visual'\)\.innerHTML = STORY_ART/,
    'renderStory больше не заполняет слот: кадр придётся монтировать заранее, и он снова уйдёт в сеть');
  assert.equal([...staticHtml.matchAll(/renderStory\(\);/g)].length, 3,
    'у renderStory появился четвёртый вызов — проверить, что он не на загрузке страницы');
});

test('разметка карточки: ярлык и подсказка подключены классами, а не цветом', () => {  assert.match(staticHtml, /product\.image \? ' has-photo' : plate \? ' has-plate' : ''/, 'card-media: класс кадра не переключается фото/ярлык');
  assert.match(staticHtml, /var plate = !product\.image && productAges\(product\)\.length === 1/, 'cardHtml: условие ярлыка потеряно');
  assert.match(staticHtml, /custom-cut-note quiet' \+ \(custom && !active\.canAdd \? ' is-error' : ''\)/, 'подсказка: тихий вариант и ошибка не переключаются');
});

test('CSS: ярлык заполняет сетку как фото, подсказка тихая, ввод веса в строку', () => {
  const plate = (/\.card-media\.has-plate \{([^}]*)\}/.exec(staticCss) || [])[1] || '';
  assert.match(plate, /aspect-ratio:\s*1 \/ 1/, 'has-plate: не квадрат сетки фото');
  const plateImg = (/\.card-media\.has-plate img \{([^}]*)\}/.exec(staticCss) || [])[1] || '';
  assert.match(plateImg, /object-fit:\s*cover/, 'has-plate img: не заполняет кадр');
  const quiet = (/\.custom-cut-note\.quiet \{([^}]*)\}/.exec(staticCss) || [])[1] || '';
  assert.match(quiet, /border-left:\s*none/, 'quiet: подсказка осталась с плашкой');
  const error = (/\.custom-cut-note\.quiet\.is-error \{([^}]*)\}/.exec(staticCss) || [])[1] || '';
  assert.match(error, /var\(--error-red\)/, 'is-error: ошибка не красная');
  const field = (/\.custom-weight-field input \{([^}]*)\}/.exec(staticCss) || [])[1] || '';
  assert.match(field, /width:\s*132px/, 'ввод веса не фиксированной ширины — поле не в строку');
});

test('CSS: мобильный вход разгружен — плашки, контакт и цена на месте', () => {
  assert.match(staticCss, /@media \(max-width: 560px\) \{ \.distributor-bar \{[^}]*font-size: 0\.75rem/, 'дистрибьюторская плашка не сжата на мобильном');
  assert.match(staticCss, /@media \(max-width: 899px\) \{ \.contact-widget \{ --contact-bottom: calc\(76px \+ env\(safe-area-inset-bottom, 0px\)\)/, 'контакт не поднят над нижней панелью');
  const demo = (/\.site-demo-notice \{([^}]*)\}/.exec(staticCss) || [])[1] || '';
  assert.match(demo, /padding:\s*7px 0/, 'демо-баннер не ужат до одной строки');
  const price = (/\.price-value \{([^}]*)\}/.exec(staticCss) || [])[1] || '';
  assert.match(price, /var\(--cured-ruby\)/, 'цена не фирменным бордо');
});

test('единственный формат — не выбор: строка без заголовка группы', () => {
  const cardHtmlStart = staticHtml.indexOf('function cardHtml(');
  assert.ok(cardHtmlStart >= 0, 'в index.html нет cardHtml — гейт потерял опору');
  const optionStart = staticHtml.indexOf('function optionMarkup(', cardHtmlStart);
  assert.ok(optionStart > cardHtmlStart && optionStart - cardHtmlStart < 2000, 'optionMarkup не объявлен внутри cardHtml');
  let depth = 0;
  let i = staticHtml.indexOf('{', optionStart);
  for (; i < staticHtml.length; i += 1) {
    if (staticHtml[i] === '{') depth += 1;
    else if (staticHtml[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  const source = staticHtml.slice(optionStart, i + 1);
  const markup = vm.runInContext(`(function () { var product = { id: 'x' }; ${source}; return optionMarkup('Формат:', 'Формат', [{ label: 'Отрез под заказ', sub: '50–2 000 г' }]); })()`, vm.createContext({}), { timeout: 5000 });
  assert.doesNotMatch(markup, /selector-caption/, 'единственный формат получил заголовок группы — это псевдовыбор');
  assert.match(markup, /option-static/, 'единственный формат не показан строкой');
  const two = vm.runInContext(`(function () { var product = { id: 'x' }; ${source}; return optionMarkup('Формат:', 'Формат', [{ label: 'Средний кусок', sub: '~300 г' }, { label: 'Отрез под заказ', sub: '50–2 000 г' }]); })()`, vm.createContext({}), { timeout: 5000 });
  assert.match(two, /selector-caption/, 'у настоящего выбора потерян заголовок группы');
  assert.match(two, /role="radiogroup"/, 'у настоящего выбора потеряна группа');
});
