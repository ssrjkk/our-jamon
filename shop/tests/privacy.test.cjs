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
