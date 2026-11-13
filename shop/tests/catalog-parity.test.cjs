// Витрины две: Next читает lib/catalog.json, статическая — такие же массивы,
// записанные inline прямо в index.html. Каждый из них по отдельности сверяется с
// прайсом 0711, но друг с другом их не сверял ни один гейт, а расхождение здесь
// означает две разные цены на одном и том же товаре для двух ссылок.
// Массивы вырезаются по балансу скобок и вычисляются в vm без остального скрипта
// страницы: смена формата должна ломать гейт громко, а не молча обесценивать его.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root } = require('./helpers.cjs');
const catalog = require('../lib/catalog.json');

const staticHtml = fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8');
// У Pages-витрины не один публичный корень: вместе с главной отдаётся 404.html, и он
// печатает телефон, адрес и часы работы. Списки файлов берём из каталога, чтобы
// следующая страница не появилась вне поля зрения гейта.
const staticPages = fs.readdirSync(path.join(root, '..')).filter((f) => f.endsWith('.html'))
  .map((f) => fs.readFileSync(path.join(root, '..', f), 'utf8')).join('\n');

function staticArray(name) {
  const start = staticHtml.indexOf(`var ${name} =`);
  assert.ok(start >= 0, `в index.html больше нет массива ${name} — гейт потерял опору`);
  const open = staticHtml.indexOf('[', start);
  let depth = 0;
  for (let i = open; i < staticHtml.length; i += 1) {
    if (staticHtml[i] === '[') depth += 1;
    else if (staticHtml[i] === ']' && (depth -= 1) === 0) {
      return vm.runInNewContext(`(${staticHtml.slice(open, i + 1)})`, Object.create(null), { timeout: 5000 });
    }
  }
  assert.fail(`массив ${name} в index.html не закрыт`);
}

const FIELDS = ['code', 'category', 'title', 'kind', 'agingMonths', 'pricePerKg', 'image', 'imageW', 'imageH', 'description'];
const list = (items, pick) => JSON.stringify((items || []).map(pick));
const product = (p) => JSON.stringify([
  ...FIELDS.map((field) => p[field] === undefined ? null : p[field]),
  list(p.pieces, (x) => [x.label, x.weightG, x.price, x.lenCm ?? null]),
  list(p.packs, (x) => [x.label, x.weightG, x.price, x.volumeMl ?? null]),
  list(p.bulk ? [p.bulk] : [], (b) => [b.pricePerKg, b.minG, b.maxG, b.stepG]),
]);

const diverging = (left, right, encode, label) => {
  const a = new Map(left.map((item) => [item.id, encode(item)]));
  const b = new Map(right.map((item) => [item.id, encode(item)]));
  const out = [...a].filter(([id]) => !b.has(id)).map(([id]) => `${label} ${id}: только в статике`);
  out.push(...[...b].filter(([id]) => !a.has(id)).map(([id]) => `${label} ${id}: только в Next`));
  for (const [id, value] of a) if (b.has(id) && b.get(id) !== value) out.push(`${label} ${id}: статика=${value.slice(0, 120)} Next=${b.get(id).slice(0, 120)}`);
  return out;
};

// Поля наборов в витринах называются по-разному (статика: kicker/desc/components,
// Next: label/description/items), поэтому нормализация приводит оба имени к одному.
const kit = (s) => JSON.stringify([
  s.title, s.kicker ?? s.label ?? null, s.desc ?? s.description ?? null,
  list(s.components || s.items, (i) => [i.productId, i.packIdx ?? null]),
]);

test('обе витрины отдают один и тот же каталог, превью и наборы', () => {
  const products = diverging(staticArray('PRODUCTS'), catalog.products, product, 'позиция');
  const previews = diverging(staticArray('CATALOG_PREVIEWS'), catalog.previews, product, 'превью');
  const sets = diverging(staticArray('SETS'), catalog.kits, kit, 'набор');
  assert.deepEqual([...products, ...previews, ...sets], [],
    `витрины расходятся в ${products.length + previews.length + sets.length} позициях(ах): ${(products.length ? products : previews).slice(0, 3).join(' | ')}`);
});

test('у гейта есть на чём сверяться: объём каталога не схлопнулся', () => {
  const products = staticArray('PRODUCTS');
  assert.ok(products.length >= 150 && catalog.products.length >= 150,
    `позиций стало меньше полутора сотен: статика ${products.length}, Next ${catalog.products.length}`);
  assert.equal(products.length, catalog.products.length, 'количество позиций в двух витринах разное');
  assert.equal(staticArray('CATALOG_PREVIEWS').length, catalog.previews.length);
  assert.equal(staticArray('SETS').length, catalog.kits.length);
  const withImage = products.filter((p) => p.image).length;
  assert.ok(withImage >= 100, `фото потеряли ${products.length - withImage} позиций — сверка картинок вырождается`);
});

// Доставка названа в трёх местах: lib/delivery.ts (имена уходят в заказ и админку),
// DELIVERY_NAMES статики (печатается в заказе Pages-витрины) и подписи самих кнопок.
// Расхождение в любом из них — одна служба приходит в два разных имени.
const deliverySource = fs.readFileSync(path.join(root, 'lib', 'delivery.ts'), 'utf8');
const nextOptions = new Map([...deliverySource.matchAll(/\{ id: '(\w+)', name: '([^']+)'/g)].map((m) => [m[1], m[2]]));
const namesLiteral = /var DELIVERY_NAMES = (\{[^}]+\})/.exec(staticHtml);
assert.ok(namesLiteral, 'в index.html больше нет DELIVERY_NAMES — гейт потерял опору');
const staticNames = vm.runInNewContext(`(${namesLiteral[1]})`, Object.create(null));
const markupLabels = new Map([...staticHtml.matchAll(/data-deliv-id="(\w+)"[^>]*>\s*<strong>([^<]+)<\/strong>/g)].map((m) => [m[1], m[2]]));

test('одна служба доставки называется одинаково в кнопке, в заказе и в обеих витринах', () => {
  assert.equal(nextOptions.size, 4, `в lib/delivery.ts опций ${nextOptions.size} — сверять нечего`);
  assert.equal(markupLabels.size, 4, `кнопок доставки в разметке ${markupLabels.size}, а не 4`);
  const ids = [...nextOptions.keys()].sort();
  assert.deepEqual([...markupLabels.keys()].sort(), ids, 'наборы опций доставки в разметке и в данных разные');
  assert.deepEqual(Object.keys(staticNames).sort(), ids, 'DELIVERY_NAMES статики разошёлся с опциями Next');
  for (const [id, name] of nextOptions) {
    assert.equal(staticNames[id], name, `доставка ${id}: в заказе статики «${staticNames[id]}», в Next «${name}»`);
    assert.equal(markupLabels.get(id), name, `доставка ${id}: кнопка «${markupLabels.get(id)}», а в данные идёт «${name}»`);
  }
});

// Порядок и заголовки групп каталога статика берёт из inline DEPT_ORDER, Next — из
// catalog.categories. Контактные ссылки витрины печатают буквально, без единого слоя.
// Ни один гейт ни то, ни другое не сверял, а расхождение здесь — это клиент с одной из
// витрин звонит по номеру, которого лавка уже не использует.
const CONTACT_RE = /tel:\+\d+|https:\/\/t\.me\/[\w+]+|https:\/\/wa\.me\/\d+|mailto:[\w.@-]+/g;
const nextContacts = new Set();
let nextCorpus = '';
for (const dir of ['app', 'components', 'lib']) {
  for (const entry of fs.readdirSync(path.join(root, dir), { recursive: true })) {
    const file = path.join(root, dir, String(entry));
    if (!/\.(?:tsx?|json)$/.test(file) || !fs.statSync(file).isFile()) continue;
    const source = fs.readFileSync(file, 'utf8');
    nextCorpus += source;
    for (const hit of source.matchAll(CONTACT_RE)) nextContacts.add(hit[0]);
  }
}
const staticContacts = new Set(staticPages.match(CONTACT_RE) || []);

test('обе витрины зовут по одним и тем же контактам', () => {
  assert.ok(nextContacts.size >= 3, `в Next осталось ${nextContacts.size} контактов — сверять нечего`);
  assert.ok(staticContacts.size >= 3, `в статике осталось ${staticContacts.size} контактов — сверять нечего`);
  assert.deepEqual([...staticContacts].sort(), [...nextContacts].sort(), 'витрины предлагают разные способы связи');
});

test('группы каталога идут в одном порядке и с одними заголовками и подписями', () => {
  const deptOrder = staticArray('DEPT_ORDER');
  assert.ok(deptOrder, 'в index.html больше нет DEPT_ORDER — гейт потерял опору');
  assert.equal(deptOrder.length, catalog.categories.length,
    `групп каталога в статике ${deptOrder.length}, в прайсе ${catalog.categories.length}`);
  // Сворачиваем в строку, а не сверяем массивы: `map` на массиве из vm выполняется в
  // песочнице, и strict-проверка отвергает внешние копии по прототипу, а не по составу.
  const names = (list) => JSON.stringify(list.map((dept) => [dept.cat, dept.title]));
  assert.equal(names(deptOrder), names(catalog.categories),
    `группы разошлись: статика ${names(deptOrder)}, прайс ${names(catalog.categories)}`);
  // Подпись группы («note») — третья строка под заголовком, и в index.html она появляется
  // только из sync-static. Три из двенадцати подписей остались с обычным пробелом в
  // разделе тысяч, тогда как прайс перешёл на неразрывный: покупатель Pages читал
  // «2 000 г», которое переносится на другую строку, а покупатель Next — «2 000 г».
  const drifted = catalog.categories.map((category, index) => ['cat', 'title', 'note']
    .filter((field) => deptOrder[index][field] !== category[field])
    .map((field) => `${category.cat}.${field}: статика ${JSON.stringify(deptOrder[index][field])}, прайс ${JSON.stringify(category[field])}`))
    .flat();
  assert.deepEqual(drifted, [], `${drifted.length} полей(о) группы разошлись с прайсом:\n${drifted.join('\n')}`);
});

// Адрес лавки и часы печатаются в обеих витринах словами, а не из одного слоя: на
// Pages шесть мест (пять на главной и одно на 404), в Next восемь. Формулировки
// намеренно разные («Сытнинская ул., 4П» и «Сытнинская, 4П»), поэтому сверяем не
// строки, а то, что реально важно покупателю: к какому дому он приедет и во сколько
// лавка закроется. Разойдутся — приедет к другому дому или к закрытой двери.
const hits = (text, re, group = 0) => [...text.matchAll(re)].map((m) => m[group].replace(/\s+/g, ''));

test('лавка ждёт по одному адресу и в одни часы на обеих витринах', () => {
  const house = (text) => hits(text, /Сытнинская[\s\S]{0,30}?(\d+\s*[А-Яа-яЁё])/g, 1);
  const hours = (text) => hits(text, /\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}/g);
  const staticHouse = house(staticPages), nextHouse = house(nextCorpus);
  assert.ok(staticHouse.length >= 3 && nextHouse.length >= 3,
    `упоминаний адреса стало слишком мало для сверки: статика ${staticHouse.length}, Next ${nextHouse.length}`);
  assert.deepEqual([...new Set([...staticHouse, ...nextHouse])], [staticHouse[0]],
    `дом самовывоза разный: статика ${JSON.stringify(staticHouse)}, Next ${JSON.stringify(nextHouse)}`);
  const allHours = [...hours(staticPages), ...hours(nextCorpus)];
  assert.ok(allHours.length >= 4, `часов работы упомянуто ${allHours.length} раз — сверять нечего`);
  assert.deepEqual([...new Set(allHours)], [allHours[0]], `часы работы разные: ${JSON.stringify(allHours)}`);
});

// Число, которое человек читает на экране, и то, которое реально наберётся по клику,
// написаны рядом, но независимо. Правится одно и забывается другое.
const TEL_RE = /tel:(\+\d+)[^>]{0,120}>([\s\S]{0,80}?)(?:<|$)/g;
const telMismatch = (text) => [...text.matchAll(TEL_RE)]
  .map((m) => [m[1].replace(/\D/g, ''), (m[2].match(/\+?[\d\s()-]{7,}/) || [''])[0].replace(/\D/g, '')])
  .filter(([dialled, shown]) => shown && shown !== dialled);

test('на обеих витринах показывают то же число, которое набирает ссылка', () => {
  const counted = (text) => [...text.matchAll(/tel:\+\d+/g)].length;
  assert.ok(counted(staticPages) >= 5 && counted(nextCorpus) >= 5,
    `tel-ссылок стало слишком мало для сверки: статика ${counted(staticPages)}, Next ${counted(nextCorpus)}`);
  assert.deepEqual([...telMismatch(staticPages), ...telMismatch(nextCorpus)], [],
    'витрина печатает один номер, а по клику набирает другой');
});

// Кольца историй — последний дубль, который не выводится ни из прайса, ни из каталога:
// состав ленты собран руками на обеих витринах. Порядок id задаёт порядок показа, а
// картинка кольца ищется по тому же id, поэтому лишнее или переименованное кольцо
// рвёт ленту молча: без картинки покупатель видит пустую рамку.
const storySource = fs.readFileSync(path.join(root, 'components', 'Stories.tsx'), 'utf8');
const artSource = fs.readFileSync(path.join(root, 'components', 'Art.tsx'), 'utf8');
const nextStoryIds = [...storySource.matchAll(/\{ id: '(\w+)', label: /g)].map((m) => m[1]);
const nextArt = new Map([...artSource.matchAll(/^ {2}(\w+): <img src="([^"]+)"/gm)].map((m) => [m[1], m[2]]));
const staticStories = staticArray('STORIES');
const artLiteral = /var STORY_ART = (\{[^}]+\})/.exec(staticHtml);
assert.ok(artLiteral, 'в index.html больше нет объекта STORY_ART — гейт потерял опору');
const staticArt = new Map(Object.entries(vm.runInNewContext(`(${artLiteral[1]})`, Object.create(null)))
  .map(([id, markup]) => [id, /src="([^"]+)"/.exec(markup)[1]]));

test('лента историй показывает одни кольца и те же картинки на обеих витринах', () => {
  assert.ok(nextStoryIds.length >= 5, `колец в Next стало ${nextStoryIds.length} — сверять нечего`);
  // Массив из vm — чужая realm: deepEqual отвергает его даже при совпадении элементов,
  // поэтому порядок колец сверяется строками, как и остальной каталог в этом гейте.
  assert.equal(JSON.stringify(staticStories.map((s) => s.id)), JSON.stringify(nextStoryIds),
    'витрины показывают разные кольца в разном порядке');
  assert.deepEqual(nextStoryIds.filter((id) => !nextArt.has(id)), [],
    'у кольца ленты нет картинка в Next');
  assert.deepEqual(nextStoryIds.filter((id) => !staticArt.has(id)), [],
    'у кольца ленты нет картинка в статике');
  const picture = nextStoryIds.filter((id) => nextArt.get(id) !== `/${staticArt.get(id)}`);
  assert.deepEqual(picture, [], `кольцо «${picture.join('», «')}» рисуется разными фото на двух витринах`);
});
