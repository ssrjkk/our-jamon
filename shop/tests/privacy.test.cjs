const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const repo = path.join(__dirname, '..', '..');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repo })
  .toString('utf8').split('\0').filter(Boolean);
const privateFiles = [
  'Сессия_Наш_Хамон.md', 'брендбук_дом_хамона.pdf', 'hamon shop 1c.pdf',
  '_brand', 'shop/Наш_Хамон.zip', 'shop/scripts/supplier-photos.json',
  'shop/data', 'shop/.env',
];
const supplierImage = /^(?:shop\/public\/)?img\/domhamona-[^/]+\.webp$/;

// Проверяем индекс, а не диск: игнорируемые локальные файлы не попадут на сервер после клонирования.
test('приватного нет в индексе git', () => {
  const leaks = tracked.filter((file) => supplierImage.test(file)
    || privateFiles.some((name) => file === name || file.startsWith(`${name}/`)));
  assert.deepEqual(leaks, [], 'Приватные материалы попадут в публичную публикацию');
});

test('приватные пути защищены правилами gitignore', () => {
  const probes = [
    ...privateFiles.filter(name => !['_brand', 'shop/data'].includes(name)),
    '_brand/source.ai', 'shop/data/orders.sqlite',
    'img/domhamona-leg-08.webp', 'shop/public/img/domhamona-leg-08.webp',
  ];
  const ignored = execFileSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], {
    cwd: repo, input: probes.join('\0') + '\0',
  }).toString('utf8').split('\0').filter(Boolean);
  assert.deepEqual(new Set(ignored), new Set(probes));
});

test('все фото каталога входят в git в обеих витринах', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(repo, 'shop/lib/catalog.json'), 'utf8'));
  const paths = new Set(tracked);
  for (const entry of [...catalog.products, ...catalog.previews]) {
    if (!entry.image) continue;
    assert.ok(!supplierImage.test(entry.image), `${entry.id}: фото поставщика без разрешения`);
    for (const prefix of ['', 'shop/public/']) {
      assert.ok(paths.has(prefix + entry.image), `${entry.id}: ${prefix + entry.image} отсутствует в git`);
    }
  }
});

// GitHub Pages отдаёт файлы репозитория как есть: ссылка на отсутствующий файл — это битая
// картинка на живой витрине, а не 404, который кто-то заметит.
test('локальные ассеты публичных страниц лежат в git', () => {
  const paths = new Set(tracked);
  const pages = ['index.html', '404.html'];
  const missing = [];
  for (const page of pages) {
    const file = path.join(repo, page);
    assert.ok(fs.existsSync(file), `${page} отсутствует в корне репозитория`);
    const html = fs.readFileSync(file, 'utf8');
    const refs = new Set([
      ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)].map((m) => m[2]),
    ]);
    for (const ref of refs) {
      if (/^(?:#|https?:|tel:|mailto:|data:|javascript:)/i.test(ref) || /^\//.test(ref)) continue;
      const clean = ref.split(/[?#]/)[0];
      if (!clean || !/\.[a-z0-9]{2,5}$/i.test(clean)) continue;
      if (!paths.has(clean)) missing.push(`${page} → ${clean}`);
    }
  }
  assert.deepEqual(missing, [], `ссылаются на файлы вне git: ${missing.join(', ')}`);
});
