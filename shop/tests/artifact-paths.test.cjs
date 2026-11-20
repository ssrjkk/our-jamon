// Ссылки на файлы внутри артефакта. Каталог и разметка ссылаются на относительные пути, а
// в боевой образ и на Pages берётся то, что реально лежит рядом: картинка, попавшая под
// правило `.dockerignore` или удалённая из папки, на проде отвечает 404, хотя локальная
// витрина выглядит целой. Гейт сверяет три вещи: путь назван, файл на диске ненулевой,
// и сборочный контекст его не выбрасывает.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./helpers.cjs');

const pages = path.join(root, '..');
const РАСШ = 'webp|avif|jpe?g|png|svg|gif|ico|woff2?|webm|mp4';
// Пробел и запятая в путь не попадают: srcset перечисляет варианты через запятую внутри
// одного значения, и жадный класс слил бы весь список в одну «ссылку на файл». Слэш в начале
// разрешён: движок пишет `/brand/...`, статика — `brand/...`, нормализует `ссылки()`.
const ПУТЬ = new RegExp(`["'(](/?(?:img|brand|fonts|assets|_brand)/[^"'()\\\\,\\s]+\\.(?:${РАСШ}))`, 'gi');

/** Все относительные пути ассетов, названные в тексте. */
function ссылки(текст) {
  return new Set([...текст.matchAll(ПУТЬ)].map((m) => m[1].replace(/^\.?\//, '')));
}

// `["'(]` ловит в srcset только первый вариант: остальные идут после запятой, а опечатка в
// ними стоит покупателю пустого кадра ровно столько же. Список разбирается по запятой и
// пробелу, как это делает браузер, и проверяется каждый кандидат, а не первый.
function кандидатыSrcset(текст) {
  const out = new Set();
  for (const m of текст.matchAll(/srcset=["']([^"']+)["']/gi)) {
    for (const part of m[1].split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (url) out.add(url.replace(/^\.?\//, ''));
    }
  }
  return out;
}

/** Источники движка: компоненты, страницы, конфигHead и каталог целиком. */
function исходникиДвижка() {
  const list = [];
  for (const dir of ['app', 'components', 'lib']) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true, recursive: true })) {
      if (entry.isFile() && /\.(ts|tsx|json)$/.test(entry.name)) list.push(path.join(entry.parentPath, entry.name));
    }
  }
  return list.filter(fs.existsSync);
}

const движокСсылки = new Set();
const движокSrcset = new Set();
for (const f of исходникиДвижка()) {
  const текст = fs.readFileSync(f, 'utf8');
  for (const s of ссылки(текст)) движокСсылки.add(s);
  for (const s of кандидатыSrcset(текст)) движокSrcset.add(s);
}
const статикаСсылки = new Set();
const статикаSrcset = new Set();
for (const abs of [path.join(pages, 'index.html'), path.join(pages, 'globals.css')]) {
  if (!fs.existsSync(abs)) continue;
  const текст = fs.readFileSync(abs, 'utf8');
  for (const s of ссылки(текст)) статикаСсылки.add(s);
  for (const s of кандидатыSrcset(текст)) статикаSrcset.add(s);
}

// `.dockerignore` в терминах сборки: без слэша — имя на любом уровне, со слэшем — путь от
// корня контекста. `*` не перелезает через каталоги, как и в Docker.
function игнорИзДокерignore() {
  const файл = path.join(root, '.dockerignore');
  assert.ok(fs.existsSync(файл), 'нет .dockerignore — проверять exclusion нечем');
  return fs.readFileSync(файл, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}
const паттерны = игнорИзДокерignore();

function выбрасывается(путьОтКорня, pattern) {
  const норм = путьОтКорня.replace(/\\/g, '/');
  const re = new RegExp('^' + pattern.split('/').map((seg) => seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('/') + '$');
  if (pattern.includes('/')) return re.test(норм);
  return норм.split('/').some((seg) => re.test(seg));
}

test('каждая названная картинка движка лежит в public и весит больше нуля', () => {
  assert.ok(движокСсылки.size >= 20, `движок назвал слишком мало ассетов (${движокСсылки.size}) — гейт потерял опору`);
  const пусто = [];
  for (const s of движокСсылки) {
    const abs = path.join(root, 'public', s);
    if (!fs.existsSync(abs)) пусто.push(s);
    else if (fs.statSync(abs).size === 0) пусто.push(s + ' (0 байт)');
  }
  assert.deepEqual(пусто, [], `в public нет этих файлов — на проде битая ссылка: ${пусто.slice(0, 8).join(', ')}`);
});

test('ни одна ссылка витрин не попадает под .dockerignore', () => {
  const подИсключением = [];
  for (const s of движокСсылки) if (паттерны.some((p) => выбрасывается(`public/${s}`, p))) подИсключением.push(s);
  // Статика берётся из корня Pages, но путь тот же: если имя попало в фильтр, его не будет ни в образе, ни на хостинге.
  for (const s of статикаСсылки) if (паттерны.some((p) => выбрасывается(s, p))) подИсключением.push(s);
  assert.deepEqual(подИсключением, [], `ассеты, названные в витринах, выбрасываются из сборки: ${[...new Set(подИсключением)].slice(0, 8).join(', ')}`);
});

test('частное в .dockerignore заперто, а не вырезано подчистую', () => {
  for (const нужное of ['.env', '.env.*', 'test-results']) {
    assert.ok(паттерны.includes(нужное), `.dockerignore больше не исключает ${нужное}`);
  }
  assert.ok(паттерны.some((p) => p.includes('supplier-photos.json')), 'рабочий файл с адресами поставщика перестал исключаться из образа');
});

test('картинки демо-витрины на месте в корне Pages', () => {
  assert.ok(статикаСсылки.size >= 20, `статика назвала слишком мало ассетов (${статикаСсылки.size}) — гейт потерял опору`);
  const пусто = [];
  for (const s of статикаСсылки) {
    const abs = path.join(pages, s);
    if (!fs.existsSync(abs)) пусто.push(s);
    else if (fs.statSync(abs).size === 0) пусто.push(s + ' (0 байт)');
  }
  assert.deepEqual(пусто, [], `в корне Pages нет этих файлов — демо отдаст 404: ${пусто.slice(0, 8).join(', ')}`);
});

test('витрины ссылаются на один и тот же набор картинок каталога', () => {  const каталог = JSON.parse(fs.readFileSync(path.join(root, 'lib', 'catalog.json'), 'utf8'));
  const изКаталога = new Set();
  (function walk(node) {
    if (typeof node === 'string') { if (/\.(?:webp|avif|jpe?g|png|svg)$/.test(node) && /^(?:\.\.?\/)?(?:img|brand|assets)\//.test(node)) изКаталога.add(node.replace(/^\.?\//, '')); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') Object.values(node).forEach(walk);
  })(каталог);
  assert.ok(изКаталога.size >= 50, `в каталоге осталось слишком мало картинок (${изКаталога.size})`);
  // Статика держит свою копию выгрузки: позиция с картинкой в каталоге и без неё в index.html — расхождение витрин.
  const нетВСтатике = [...изКаталога].filter((s) => !статикаСсылки.has(s));
  assert.deepEqual(нетВСтатике, [], `картинки каталога не названы в демо-витрине: ${нетВСтатике.slice(0, 6).join(', ')}`);
});

// srcset — единственный слой, где браузер сам решает, что скачать. Список кандидатов
// печатается прямо в разметке обеих витрин, и дыра в нём невидима: первый вариант грузится
// всегда, а отсутствующий 400w подставляет битую ссылку только на части экранов.
test('каждый вариант srcset лежит в своём корне и не выбрасывается сборкой', () => {
  assert.ok(движокSrcset.size >= 8 && статикаSrcset.size >= 8,
    `вариантов в srcset стало ${движокSrcset.size}/${статикаSrcset.size} — сверять нечего`);
  const нетФайла = [];
  for (const s of движокSrcset) {
    const abs = path.join(root, 'public', s);
    if (!fs.existsSync(abs)) нетФайла.push(`public/${s}`);
    else if (fs.statSync(abs).size === 0) нетФайла.push(`public/${s} (0 байт)`);
  }
  for (const s of статикаSrcset) {
    const abs = path.join(pages, s);
    if (!fs.existsSync(abs)) нетФайла.push(`${s}`);
    else if (fs.statSync(abs).size === 0) нетФайла.push(`${s} (0 байт)`);
  }
  assert.deepEqual(нетФайла, [], `вариант srcset ведёт в пустоту — на части экранов покупатель получит 404: ${нетФайла.slice(0, 8).join(', ')}`);
  const подИсключением = [...движокSrcset, ...статикаSrcset].filter((s) => паттерны.some((p) => выбрасывается(`public/${s}`, p) || выбрасывается(s, p)));
  assert.deepEqual(подИсключением, [], `варианты srcset выбрасываются из сборки: ${[...new Set(подИсключением)].slice(0, 6).join(', ')}`);
  // Наборы кандидатов обязаны совпадать: разный список — разный вес главной у двух ссылок
  // и разные picture-in-один-и-тот-же-слот, когда браузер выбирает из разного.
  assert.deepEqual([...статикаSrcset].sort(), [...движокSrcset].sort(),
    `витрины предлагают браузеру разные варианты: только в демо ${[...статикаSrcset].filter((s) => !движокSrcset.has(s)).join(', ')}, только в движке ${[...движокSrcset].filter((s) => !статикаSrcset.has(s)).join(', ')}`);
});

