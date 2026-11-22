// Единственный источник правды о том, что уходит на GitHub Pages.
//
// Pages раньше собирался в режиме legacy из корня репозитория, то есть публиковалось
// всё отслеживаемое: вместе с демо отдавались /shop/lib/orders.ts, /RELEASE.md и
// /brand.zip. Этот скрипт берёт только витрину — страницы, robots и два корня
// ассетов — и проверяет замыкание ссылок: картинка, не попавшая в артефакт, на живой
// демо отвечает битым кадром, а не 404, который кто-то заметит.
//
// Запуск: node scripts/build-pages-artifact.mjs
// Каталог назначения: demo-dist/ в корне репозитория, либо PAGES_ARTIFACT_DIR.
import fs from 'node:fs';
import path from 'node:path';

const repo = path.join(import.meta.dirname, '..', '..');
const out = process.env.PAGES_ARTIFACT_DIR
  ? path.resolve(process.env.PAGES_ARTIFACT_DIR)
  : path.join(repo, 'demo-dist');
const MANIFEST = '__pages-artifact.json';

// Страницы, которые отдаются как есть, и корни ассетов, на которые они ссылаются.
const PAGES = ['index.html', '404.html', 'robots.txt'];
const ASSET_DIRS = ['brand', 'img'];

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const ASSET_FILE = /\.(?:webp|avif|jpe?g|png|svg|gif|ico|woff2?|css|js|webm|mp4)$/i;
// Пути ассетов живут не только в src/href: каталог в index.html держит `image:
// 'img/nf-00000185.webp'`, и без этого свипа проверка видела бы 27 ссылок вместо 172.
// Кавычки и скобки в класс путей не попадают, поэтому склейки вида `' + product.image + '`
// не превращаются в несуществующий файл.
const ПУТЬ = new RegExp(`["'(](/?(?:img|brand|fonts|assets)/[^"'()\\\\,\\s]+\\.(?:webp|avif|jpe?g|png|svg|gif|ico|woff2?|css|js|webm|mp4))`, 'gi');

/** Все относительные ссылки на файлы из разметки страницы, включая кандидаты srcset. */
function ссылки(text) {
  const found = new Set();
  const push = (raw) => {
    if (!raw) return;
    const url = raw.trim().split(/\s+/)[0].split('#')[0].split('?')[0];
    if (!url || ABSOLUTE.test(url) || /\s/.test(url) || !ASSET_FILE.test(url)) return;
    found.add(url.replace(/^\.?\//, ''));
  };
  for (const m of text.matchAll(/(?:src|href)="([^"]+)"/g)) push(m[1]);
  for (const m of text.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)) push(m[2]);
  for (const m of text.matchAll(ПУТЬ)) push(m[1]);
  for (const m of text.matchAll(/srcset="([^"]+)"/g)) for (const part of m[1].split(',')) push(part);
  return [...found].sort();
}

function assertNotOurDir(dir) {
  // Каталог удаляется перед сборкой: стираем только то, что сами и создали. Маркер
  // пишется до копирования, поэтому неудачная сборка оставляет после себя узнаваемую
  // заготовку, а не папку, которую следующий прогон побоялся бы убрать.
  if (!fs.existsSync(dir)) return;
  if (!fs.existsSync(path.join(dir, MANIFEST))) {
    console.error(`${dir} существует, но не был создан этим скриптом — удалять нечего, уходим.`);
    process.exit(1);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

assertNotOurDir(out);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, MANIFEST), JSON.stringify({ partial: true, files: [] }));

const files = [];
const add = (rel) => {
  const src = path.join(repo, rel);
  if (!fs.existsSync(src)) {
    console.error(`нет ${rel} — артефакт собирался бы без обязательной страницы`);
    process.exit(1);
  }
  const dst = path.join(out, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  files.push({ path: rel.split(path.sep).join('/'), bytes: fs.statSync(dst).size });
};

for (const page of PAGES) add(page);
for (const dir of ASSET_DIRS) {
  for (const entry of fs.readdirSync(path.join(repo, dir), { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    add(path.join(entry.parentPath || path.join(repo, dir), entry.name).slice(repo.length + 1));
  }
}

const published = new Set(files.map((f) => f.path));
// Список ссылок кладётся в манифест: гейт проверяет замыкание по нему, и свип живёт
// в одном месте. Дублировать разбор разметки во втором файле — значит получать две
// проверки, которые расходятся молча.
const allRefs = new Set();
const missing = [];
for (const page of PAGES.filter((name) => name.endsWith('.html'))) {
  const text = fs.readFileSync(path.join(out, page), 'utf8');
  for (const ref of ссылки(text)) {
    allRefs.add(ref);
    if (!published.has(ref)) missing.push(`${page} → ${ref}`);
  }
}
if (missing.length) {
  console.error(`в артефакт не попал ${missing.length} ассет(а), на демо это битая ссылка:\n  ${missing.slice(0, 12).join('\n  ')}`);
  console.error('Добавь корень в ASSET_DIRS или положи файл в brand/ либо img/.');
  process.exit(1);
}

const bytes = files.reduce((sum, f) => sum + f.bytes, 0);
fs.writeFileSync(path.join(out, MANIFEST), JSON.stringify({
  files,
  refs: [...allRefs].sort(),
  total: files.length,
  bytes,
}, null, 2));
console.log(`артефакт Pages: ${files.length} файлов, ${allRefs.size} названных ассетов, ${(bytes / 1024).toFixed(0)} КБ в ${path.relative(repo, out)}`);
