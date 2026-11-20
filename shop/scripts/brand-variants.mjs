// Варианты брендовых фото под измеренные слоты. Пузырёк кольца истории на всех вьюпортах
// 62 CSS-пикселя (124 на мобильной сетке), кадр — 296 на мобайле и 390 на остальном, а в
// репозитории лежит исходник 720×1280 на ~240 КБ: лента тянула пять полных фото, ~1 МБ на
// каждую главную. Генератор кладёт рядом 180-пиксельный знак для пузырька и 400-пиксельный
// для кадра на десктопе; полный файл остаётся источником для мобильной шторки, где кадр
// занимает 592 device-пикселя. Оба корня — боевой public/ и корень Pages — получают один и
// те же файлы, иначе витрины разойдутся по весу.
//
// Слот героя задан не шириной экрана, а колонкой контейнера: 458 CSS-пикселей на 1280+,
// 92 % вьюпорта на мобайле (мерка 320–430: 286–388 px). Значит максимальная надобность —
// 390×dpr3 = 1044 device-пикселя, а исходник 1314 уходил на каждый экран, включая
// 1920×dpr1, где он в 2,9 раза больше слота.
import sharp from 'sharp';
import { cpSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webp = path.join(root, 'public', 'brand');
const pages = path.resolve(root, '..', 'brand');
mkdirSync(pages, { recursive: true });

const ИМЕНА = {
  'hero-slicing': [[180, 74], [400, 76], [700, 80], [1000, 78]],
  'choice-table-1': [[180, 74], [400, 76]],
  'choice-self': [[180, 74], [400, 76]],
  'choice-gift': [[180, 74], [400, 76]],
  'shop-interior': [[180, 74], [400, 76]],
};

for (const [name, Ширина] of Object.entries(ИМЕНА)) {
  const source = path.join(webp, `${name}.webp`);
  const info = await sharp(source).metadata();
  for (const [width, quality] of Ширина) {
    if (width >= info.width) { console.log(`пропуск ${name}: вариант ${width}w шире исходника ${info.width}`); continue; }
    const file = `${name}-${width}.webp`;
    const buffer = await sharp(source).resize({ width, withoutEnlargement: true }).webp({ quality }).toBuffer();
    await sharp(buffer).toFile(path.join(webp, file));
    cpSync(path.join(webp, file), path.join(pages, file));
    console.log(`${file}: ${info.width}→${width}, ${Math.round(statSync(path.join(webp, file)).size / 1024)}К`);
  }
}
