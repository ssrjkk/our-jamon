// Синхронизирует данные статической витрины index.html с lib/catalog.json.
// Прайс поставщика — единственный источник: правки вносятся в build-catalog.mjs,
// этот файл переносит результат в демо-страницу. Запуск: node scripts/sync-static.mjs
import fs from 'node:fs';
import path from 'node:path';
import catalog from '../lib/catalog.json' with { type: 'json' };

const htmlPath = path.join(import.meta.dirname, '..', '..', 'index.html');
const raw = fs.readFileSync(htmlPath, 'utf8');
// index.html хранит CRLF — внутри работаем в LF, при записи восстанавливаем CRLF.
const crlf = raw.includes('\r\n');
const html = crlf ? raw.replace(/\r\n/g, '\n') : raw;

const js = (value) => (value === null || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value));
const line = (fields) => '  { ' + fields.map(([key, value]) => `${key}: ${js(value)}`).join(', ') + ' }';

const products = catalog.products.map((product) => line([
  ['id', product.id], ['code', product.code], ['category', product.category], ['title', product.title],
  ['agingMonths', product.agingMonths], ['description', product.description], ['kind', product.kind],
  ['pricePerKg', product.pricePerKg], ['pieces', product.pieces], ['packs', product.packs],
  ['bulk', product.bulk], ['image', product.image], ['imageW', product.imageW], ['imageH', product.imageH],
]));

const previews = catalog.previews.map((preview) => line([
  ['id', preview.id], ['code', preview.code], ['category', preview.category], ['title', preview.title],
  ['agingMonths', preview.agingMonths], ['description', preview.description], ['image', preview.image], ['imageW', preview.imageW], ['imageH', preview.imageH], ['preview', true],
]));

const departments = catalog.categories.map((category) => line([
  ['cat', category.cat], ['id', `dept-${category.cat}`], ['title', category.title], ['note', category.note],
]));

const sets = catalog.kits.map((kit) => '  { ' + [
  `id: ${js(kit.id)}`, `kicker: ${js(kit.label)}`, `title: ${js(kit.title)}`, `desc: ${js(kit.description)}`,
  `components: ${js(kit.items.map((item) => ({ productId: item.productId, packIdx: item.packIdx })))}`,
].join(', ') + ' }');

const blocks = [
  ['var PRODUCTS = [', 'var CATALOG_PREVIEWS', ['var PRODUCTS = [\n', products.join(',\n') + '\n];']],
  ['var CATALOG_PREVIEWS = [', 'function catalogEntries', ['var CATALOG_PREVIEWS = [\n', previews.join(',\n') + '\n];\n']],
  ['var DEPT_ORDER = [', 'function matchesAge', ['var DEPT_ORDER = [\n', departments.join(',\n') + '\n];\n']],
  ['var SETS = [', 'var DELIVERY_NAMES', ['var SETS = [\n', sets.join(',\n') + '\n];\n']],
];

let output = html;
for (const [start, end, replacement] of blocks) {
  const from = output.indexOf(start);
  const to = output.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Не найден блок ${start} … ${end}`);
  output = output.slice(0, from) + replacement.join('') + output.slice(to);
}

if (output !== html) fs.writeFileSync(htmlPath, crlf ? output.replace(/\n/g, '\r\n') : output);
console.log(`index.html${output === html ? ' уже синхронизирован' : ' обновлён'}: товаров ${products.length}, превью ${previews.length}, групп ${departments.length}, наборов ${sets.length}`);
