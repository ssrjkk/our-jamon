// Проверка собранного вывода: боевой адрес не должен печататься из fallback.
// Next снимает robots и prerender-страницы во время `next build`. Если SHOP_URL тогда нет,
// в образ ложится адрес демо с GitHub Pages: canonical на живой витрины указывает оригинал
// на демо-хост, а robots отправляет роботов читать демо-карту сайтов. Ни тесты, ни запуск
// контейнера этого не видят — адрес заметен только в собранных файлах.
// Запуск: node scripts/verify-build.mjs (после next build, с тем же SHOP_URL, что и сборка).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const appDir = join(root, '.next', 'server', 'app');

// Демо-адрес берётся из того же места, где он живёт: список запрещённых хостов не должен
// разъезжаться с lib/config.ts, когда адрес поменяют.
const configSource = readFileSync(join(root, 'lib', 'config.ts'), 'utf8');
const pagesUrl = /const PAGES_URL = '([^']+)'/.exec(configSource)?.[1];
if (!pagesUrl) {
  console.error('Не найден PAGES_URL в lib/config.ts — проверка потеряла опору и потому ничего не подтверждает.');
  process.exit(1);
}
const pagesHost = new URL(pagesUrl).host;
const shopUrl = process.env.SHOP_URL?.trim();
const expectedOrigin = shopUrl ? new URL(shopUrl).origin : null;

if (!existsSync(appDir)) {
  console.error(`Нет ${relative(root, appDir)} — сначала next build.`);
  process.exit(1);
}

const candidates = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    // Только то, что реально увидит поисковик: собранный HTML, robots и RSC-сегменты страниц.
    else if (/\.(html|body|segment\.rsc)$/.test(entry.name) && statSync(file).size > 0) candidates.push(file);
  }
};
walk(appDir);

const problems = [];
let проверено = 0;
for (const file of candidates) {
  const text = readFileSync(file, 'utf8');
  проверено += 1;
  const where = relative(root, file).replace(/\\/g, '/');
  if (text.includes(pagesHost)) {
    const строк = (text.match(new RegExp(`[^"'<> ]{0,80}${pagesHost.replace(/\./g, '\\.')}[^"'<>]{0,60}`, 'g')) || []).slice(0, 2);
    problems.push(`${where}: в собранном выводе адрес демо ${pagesHost} — ${строк.join(' § ').slice(0, 160)}`);
    continue;
  }
  if (!expectedOrigin) continue;
  // Абсолютные адреса каноника и социальных карточек обязаны совпадать с SHOP_URL.
  for (const match of text.matchAll(/(?:rel="canonical"|property="og:url"|property="og:image"|name="twitter:image")"[^>]*?(?:href|content)="(https?:\/\/[^"]+)"/g)) {
    let url;
    try { url = new URL(match[1]); } catch { continue; }
    if (url.origin !== expectedOrigin) problems.push(`${where}: ${match[1]} не совпадает с SHOP_URL (${expectedOrigin})`);
  }
}

if (проверено < 5) {
  problems.push(`проверено всего ${проверено} файлов сборки — свип ничего не подтвердил, ищи другой путь к .next/server/app`);
}

if (problems.length) {
  console.error(`Сборка печатает не тот адрес (${problems.length} проблем):\n  ${problems.join('\n  ')}`);
  console.error(`Пересобери с боевым адресом: SHOP_URL=https://<домен> npm run build:standalone`);
  console.error(`Для образа: docker build --build-arg SHOP_URL=https://<домен> -t hamonshop .`);
  process.exit(1);
}

console.log(`Собранный вывод чист: ${проверено} файлов, ни одной ссылки на ${pagesHost}${expectedOrigin ? `, абсолютные адреса совпадают с ${expectedOrigin}` : ', SHOP_URL не задан — сверены только демо-адреса'}.`);
