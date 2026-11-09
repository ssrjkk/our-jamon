// Конвертирует фото номенклатуры из выгрузки прайса в WebP с id каталога.
// Запуск: node scripts/build-photos.mjs <dump.json> <map.json> <mediaDir>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [dumpPath, mapPath, mediaDir] = process.argv.slice(2);
if (!dumpPath || !mapPath || !mediaDir) throw new Error('Usage: node scripts/build-photos.mjs <dump.json> <map.json> <mediaDir>');

const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
const photoMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const grid = new Map();
for (const cell of dump.cells) {
  if (cell.value === null || cell.value === undefined) continue;
  const row = grid.get(cell.row) ?? {};
  row[cell.column] = String(cell.value).replace(/\s+/g, ' ').trim();
  grid.set(cell.row, row);
}

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slugify = (value) => value.toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const targets = [path.join(import.meta.dirname, '..', 'public', 'img'), path.join(import.meta.dirname, '..', '..', 'img')];
for (const dir of targets) fs.mkdirSync(dir, { recursive: true });

let converted = 0;
for (const [rowKey, media] of Object.entries(photoMap)) {
  const row = grid.get(Number(rowKey) - 1);
  const code = row?.[2];
  if (!code) continue;
  const id = `nf-${code.replace(/^НФ-?/i, '')}`;
  const source = path.join(mediaDir, `row${String(rowKey).padStart(3, '0')}.png`);
  if (!fs.existsSync(source)) continue;
  const webp = await sharp(source).resize({ width: 560, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  for (const dir of targets) fs.writeFileSync(path.join(dir, `${id}.webp`), webp);
  converted += 1;
}
console.log('фото сконвертировано:', converted);
