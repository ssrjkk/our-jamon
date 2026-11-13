// Ссылки разметки и скрипта обязаны вести в элемент, который кто-то объявил.
// Мёртвый getElementById — это контрол без эффекта, aria-describedby на несуществующий
// id — подпись, которую скринридер не прочитает, якорь href="#…" без цели — пустой
// клик, popovertarget без панели — кнопка, которая молчит. Id объявляются не только
// литералом: часть собирается склейкой («cut-note-» + id товара) или шаблоном
// (`${id}-error`), поэтому объявление режется до первого разрыва в префикс.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./helpers.cjs');

const repo = path.join(root, '..');
// Разделённые мишени. Next объявляет id во всех своих модулях сразу, а каждый HTML-файл
// Pages — отдельный документ: ссылку из 404.html обязан закрывать 404.html, а не витрина.
// Общий корпус на оба корня пропускал битвый якорь Next, если тот же id был в статике.
const группы = new Map();
const добавь = (файл, ключ) => {
  if (!группы.has(ключ)) группы.set(ключ, []);
  группы.get(ключ).push({ файл, текст: fs.readFileSync(path.join(repo, файл), 'utf8') });
};
const источники = [];
const walk = (dir, filter) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter);
    else if (filter.test(entry.name)) источники.push(path.relative(repo, full).replace(/\\/g, '/'));
  }
};
for (const dir of ['app', 'components', 'lib']) walk(path.join(root, dir), /\.(?:tsx?|html)$/);
// Страницы Pages-витрины лежат в корне репозитория; глубже в корень не идём — там
// node_modules и чужие каталоги.
for (const file of fs.readdirSync(repo).filter((f) => f.endsWith('.html'))) источники.push(file);
for (const файл of источники) добавь(файл, файл === 'index.html' || файл === '404.html' ? файл : 'next');

function braceRegion(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}' && (depth -= 1) === 0) return text.slice(open + 1, i);
  }
  assert.fail('атрибут-ссылка с незакрытой фигурной скобкой');
}

// Всё, чем файлы объявляют id: литералы, префиксы склейк («cut-note-» + id) и хвосты
// шаблонов, где переменная стоит впереди (`${id}-error`). Хвост — это то, что остаётся
// после последнего ${…}: пару «htmlFor={`${id}-weight`}» ↔ «id={`${id}-weight`}» видно
// только по нему. Плюс строковые литералы свойства id в конфигах (`{ id: 'shop', … }`),
// которыми Next рендерит панели через `id={tab.id}`: без них живой id невидим для текста.
// Разложение одного значения id: литерал, префикс или хвост.
function classify(value, into) {
  if (value.startsWith('${')) {
    const tail = value.slice(value.lastIndexOf('}') + 1);
    if (tail) into(tail, 'tail');
    return;
  }
  if (value.includes('${')) { into(value.split('${')[0], 'prefix'); return; }
  if (/'\s*\+/.test(value)) { into(value.split(/['"]/)[0], 'prefix'); return; }
  value.split(/\s+/).filter(Boolean).forEach((id) => into(id, 'literal'));
}

// Значения атрибутов-ссылок в трёх формах: «attr="a b"», «attr={'a'}» и
// «attr={cond ? `x-${id}` : undefined}», плюс склейка строки с переменной в статике.
function refsOfAttribute(text, attr) {
  const out = new Set();
  const into = (value, kind) => {
    if (!value) return;
    if (kind === 'tail') out.add(`~${value}`);
    else if (kind === 'prefix') out.add(value.endsWith('-') ? value : `${value}-`);
    else out.add(value);
  };
  for (const m of text.matchAll(new RegExp(`\\b${attr}\\s*=\\s*(["'\\x60])([^"'\\x60\\n]{1,160})\\1`, 'g'))) {
    const glued = /^([\w-]+)['"]\s*\+/.exec(m[2]);
    if (glued) into(glued[1], 'prefix');
    else m[2].split(/\s+/).filter((v) => /^[\w][\w-]*$/.test(v)).forEach((v) => into(v, 'literal'));
  }
  for (let i = text.indexOf(`${attr}={`); i >= 0; i = text.indexOf(`${attr}={`, i + 1)) {
    for (const lit of braceRegion(text, i + attr.length + 1).matchAll(/(["'`])([^"'`]*)\1/g)) {
      const value = lit[2];
      if (value.includes('${')) classify(value, into);
      else value.split(/\s+/).filter((v) => /^[\w][\w-]*$/.test(v)).forEach((v) => into(v, 'literal'));
    }
  }
  return [...out];
}

const LOOKUPS = [
  ['getElementById', (text) => [...new Set([...text.matchAll(/getElementById\(['"]([\w-]+)['"]\s*\)/g)].map((m) => m[1]))]],
  ['getElementById-склейка', (text) => [...new Set([...text.matchAll(/getElementById\(['"]([\w-]+)['"]\s*\+/g)].map((m) => m[1]))]],
  // Вызов шаблоном — «getElementById(`dept-${cat}`)»: цель живёт в префиксе до первой переменной.
  ['getElementById-шаблон', (text) => [...new Set([...text.matchAll(/getElementById\(`([^`\\\n]{1,120})`\s*\)/g)].map((m) => m[1]))]],
  ['href-якорь', (text) => [...new Set([...text.matchAll(/href=["']#([\w-]+)["']/g)].map((m) => m[1]))]],
  ...['popovertarget', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'for', 'htmlFor'].map(
    (attr) => [attr, (text) => refsOfAttribute(text, attr)]),
];

// Ссылка может быть литералом, префиксом склейки или хвостом шаблона — нормализуем найденное
// значение в ту же форму, в какой объявление попадает в «declared/prefixes/tails».
const норма = (value) => {
  const out = [];
  classify(value, (v, kind) => out.push(kind === 'tail' ? `~${v}` : kind === 'prefix' ? (v.endsWith('-') ? v : `${v}-`) : v));
  return out.length ? out : [value];
};

// Якорь через страницу («href="/#shop"», «href="./#catalog"») живёт в другом документе,
// поэтому сверяется не со своей группой, а с домашней страницей своего корня.
const МЕЖДОКУМЕНТНЫЕ = (text) => [...new Set([...text.matchAll(/href=["'][^"#]+#([\w-]+)["']/g)].map((m) => m[1]))];

function разбор(файлы) {
  const declared = new Set();
  const prefixes = new Set();
  const tails = new Set();
  const push = (value, kind) => {
    if (!value) return;
    if (kind === 'tail') tails.add(value);
    else if (kind === 'prefix') prefixes.add(value.endsWith('-') ? value : `${value}-`);
    else declared.add(value);
  };
  const чужие = new Set();
  for (const { текст } of файлы) {
    for (const m of текст.matchAll(/\bid\s*=\s*(["'`])([^"'`\n]{1,120})\1/g)) classify(m[2], push);
    for (const m of текст.matchAll(/\bid=\{`([^`]*)`\}/g)) classify(m[1], push);
    for (const m of текст.matchAll(/\bid="([^"]*)'\s*\+/g)) prefixes.add(m[1]);
    // Локальная переменная с id-шаблоном: const inputId = `admin-weight-${uid}`.
    for (const m of текст.matchAll(/const\s+\w+\s*=\s*(['"`])([^'"`]*)\1/g)) classify(m[2], push);
    for (const m of текст.matchAll(/\bid:\s*(['"])([\w-]+)\1/g)) declared.add(m[2]);
    for (const ref of МЕЖДОКУМЕНТНЫЕ(текст)) чужие.add(ref);
  }
  const resolves = (ref) => ref.startsWith('~')
    ? tails.has(ref.slice(1))
    : ref.endsWith('-')
      // Префикс ссылки может закрываться как склейкой («dept-» + cat), так и рядом
      // литералов («id="checkout-name"» на «getElementById(`checkout-${field}`)»).
      ? [...prefixes].some((p) => p === ref || p.startsWith(ref) || ref.startsWith(p)) || [...declared].some((d) => d.startsWith(ref))
      : declared.has(ref) || [...prefixes].some((p) => p.length > 2 && ref.startsWith(p));
  const found = [];
  for (const { файл, текст } of файлы) {
    for (const [label, pick] of LOOKUPS) {
      for (const ref of pick(текст)) for (const значение of норма(ref)) found.push({ file: файл, label, ref: значение });
    }
  }
  return { declared, prefixes, tails, found, чужие, resolves };
}

const разборы = new Map([...группы].map(([ключ, файлы]) => [ключ, разбор(файлы)]));
const домашние = { next: 'next', 'index.html': 'index.html', '404.html': 'index.html' };

test('опора гейта: id объявлены, ссылки найдены', () => {
  // Пороги сняты с фактических счётчиков (next: 57 id и 46 ссылок, index.html: 317 id и 96
  // ссылок, 404.html: 7 межстраничных якорей) и стоят заметно ниже измеренного — расползание
  // корпуса видно, а легитимная мелкая правка гейт не роняет.
  const сумма = (поле) => [...разборы.values()].reduce((acc, р) => acc + (р[поле].size ?? р[поле].length), 0);
  assert.ok(сумма('found') >= 100, `ссылок на id найдено ${сумма('found')} — детектор сломался`);
  assert.ok(разборы.get('next').declared.size >= 45, `литеральных id в Next осталось ${разборы.get('next').declared.size} — сверять нечего`);
  assert.ok(разборы.get('next').found.length >= 35, `ссылок в Next найдено ${разборы.get('next').found.length} — корпус Next распался`);
  assert.ok(разборы.get('index.html').declared.size >= 250, `литеральных id в статике осталось ${разборы.get('index.html').declared.size} — сверять нечего`);
  assert.ok(сумма('prefixes') >= 12, `префиксов склеек осталось ${сумма('prefixes')} — динамические id ушли из поля зрения`);
  assert.ok(сумма('tails') >= 6, `хвостов шаблонов осталось ${сумма('tails')} — пары htmlFor/id не видно`);
  assert.ok(разборы.get('404.html').чужие.size >= 5, `междокументных якорей на 404 стало ${разборы.get('404.html').чужие.size} — сверка разъехалась`);
});

test('ни одна ссылка не ведёт в никуда внутри своей витрины', () => {
  const dangling = [];
  for (const [ключ, р] of разборы) {
    for (const { file, label, ref } of р.found) {
      if (!р.resolves(ref)) dangling.push(`${ключ} :: ${file} :: ${label} :: ${ref}`);
    }
  }
  assert.deepEqual(dangling, [], 'контрол ссылается на id, которого нет в этом же корне');
});

test('якорь через страницу ведёт в id домашней страницы своего корня', () => {
  const dangling = [];
  for (const [ключ, р] of разборы) {
    const цель = разборы.get(домашние[ключ]);
    for (const ref of р.чужие) {
      if (!цель.resolves(ref)) dangling.push(`${ключ} :: #${ref} → ${домашние[ключ]}`);
    }
  }
  assert.deepEqual(dangling, [], 'ссылка « страница#раздел» ведёт в раздел, которого на домашней странице нет');
});

test('каждый <main> принимает ссылку «к содержимому»', () => {
  // Ссылка в шапке одна на все роуты и ведёт ровно в #main-content. Пока обработчик брал
  // «первый main» через querySelector, битая цель на /cart была не видна: скрипт тыкался в
  // чужой <main>, а покупатель с клавиатуры уезжал в начало документа. Здесь тот же уговор
  // проверяется по исходнику — имя файла в сообщении вместо «страница не прокрутилась».
  const next = группы.get('next');
  const шапка = next.find((ф) => ф.файл.endsWith('SiteHeader.tsx'));
  assert.ok(шапка, 'SiteHeader.tsx пропал из корпуса — сверять ссылку нечем');
  assert.match(шапка.текст, /href="#main-content"/, 'шапка больше не ссылается на #main-content');
  assert.match(шапка.текст, /getElementById\('main-content'\)/, 'обработчик шапки берёт id, отличный от ссылки');
  const opening = next.flatMap(({ файл, текст }) => [...текст.matchAll(/<main\b[^>]*>/g)].map((m) => ({ файл, тег: m[0] })));
  assert.ok(opening.length >= 10, `<main> найдено ${opening.length} — разметка ушла из поля зрения`);
  const безЦели = opening.filter((м) => !/id=["']main-content["']/.test(м.тег))
    .map((м) => `${м.файл} :: ${м.тег.replace(/\s+/g, ' ').slice(0, 70)}`);
  assert.deepEqual(безЦели, [], '<main> без id, на который указывает ссылка «к содержимому»');
});

// Одна роль — одно имя. Разные подписи у однотипных областей заставляют скринридер
// читать «Навигационная цепочка» на товаре и «Хлебные крошки» на «О нас», и покупатель
// не понимает, что это один и тот же участок.
test('одинаковые области названы одним именем', () => {
  const имена = new Map();
  for (const { файл, текст } of группы.get('next')) {
    for (const m of текст.matchAll(/<nav\b[^>]*?className=["']([^"']*)["'][^>]*?aria-label=["']([^"']*)["']/g)) {
      const ключ = m[1].trim().split(/\s+/)[0] || '(без класса)';
      if (!имена.has(ключ)) имена.set(ключ, new Map());
      const набор = имена.get(ключ);
      if (!набор.has(m[2])) набор.set(m[2], new Set());
      набор.get(m[2]).add(файл);
    }
    for (const m of текст.matchAll(/<nav\b(?![^>]*className)(?![^>]*aria-label)[^>]*>/g)) {
      assert.fail(`${файл}: <nav> без className и без aria-label — область нечем назвать`);
    }
  }
  const расхождения = [];
  for (const [ключ, набор] of имена) {
    if (набор.size > 1) расхождения.push(`${ключ}: ${[...набор.keys()].join(' / ')} (${[...набор.values()].flatMap((s) => [...s]).join(', ')})`);
  }
  assert.deepEqual(расхождения, [], 'у однотипных областей разные имена — привести к одному');
  assert.ok([...имена.keys()].includes('breadcrumbs'), 'гейт потерял хлебные крошки из поля зрения');
  assert.deepEqual([...имена.get('breadcrumbs').keys()], ['Хлебные крошки'], 'хлебные крошки называются по-разному');
});
