// GitHub Pages обязан отдавать только демо-витрину. Пока Pages собирался в режиме legacy
// из корня репозитория, по адресу витрины жил и исходник движка: /shop/lib/orders.ts,
// /shop/app/api/orders/route.ts, /RELEASE.md, /brand.zip. Гейт собирает артефакт тем же
// скриптом, который запускает workflow, и сверяет именно его: список путей, побайтовую
// идентичность страниц, замыкание ссылок и то, что закрытие от индексации попало в
// опубликованный файл, а не осталось только в рабочем дереве.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { root } = require('./helpers.cjs');
const repo = path.join(root, '..');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pages-artifact-')), 'demo-dist');

execFileSync(process.execPath, [path.join(root, 'scripts', 'build-pages-artifact.mjs')], {
  cwd: root,
  env: { ...process.env, PAGES_ARTIFACT_DIR: out },
  stdio: 'pipe',
});

const manifest = JSON.parse(fs.readFileSync(path.join(out, '__pages-artifact.json'), 'utf8'));
const published = new Set(manifest.files.map((file) => file.path));
const read = (rel) => fs.readFileSync(path.join(out, rel), 'utf8');
const digest = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

const gitFiles = (prefix) => execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files', '-z', '--', prefix], { cwd: repo })
  .toString('utf8').split('\0').filter(Boolean);

test('артефакт Pages состоит только из витрины', () => {
  assert.ok(published.size >= 150, `в артефакте ${published.size} файлов — сборка не состоялась`);
  const allowed = /^(?:index\.html|404\.html|robots\.txt|(?:brand|img)\/.+)$/;
  const extra = [...published].filter((file) => !allowed.test(file));
  assert.deepEqual(extra, [], `в публичный артефакт попали лишние пути: ${extra.slice(0, 8).join(', ')}`);
});

test('исходник движка и архивы бренда не публикуются, хотя лежат в git', () => {
  const hidden = ['brand.zip', '_brand.zip', 'RELEASE.md', 'README.md', '.gitignore', 'shop/lib/orders.ts', 'shop/app/api/orders/route.ts'];
  for (const file of hidden) {
    assert.ok(gitFiles(file).length === 1, `${file} должен быть отслеживаемым — иначе проверка ничего не доказывает`);
    assert.ok(!published.has(file), `${file} отдается на адресе витрины`);
  }
  const served = [...published].filter((file) => /\.(?:ts|tsx|md|zip|sqlite)$/i.test(file));
  assert.deepEqual(served, [], `в артефакте остались исходники или архивы: ${served.slice(0, 6).join(', ')}`);
});

test('ни один ассет из git не теряется при сборке', () => {
  for (const dir of ['brand', 'img']) {
    const tracked = gitFiles(dir);
    assert.ok(tracked.length >= 10, `в ${dir} отслеживается ${tracked.length} файлов — свип теряет опору`);
    const dropped = tracked.filter((file) => !published.has(file));
    assert.deepEqual(dropped, [], `не скопировано в артефакт: ${dropped.slice(0, 8).join(', ')}`);
  }
});

test('опубликованные страницы побайтово равны файлам из репозитория', () => {
  for (const page of ['index.html', '404.html', 'robots.txt']) {
    assert.equal(digest(path.join(out, page)), digest(path.join(repo, page)), `${page}: в артефакт попало не то, что в репозитории`);
  }
});

// Демо содержит неподтверждённые цены и тестовую оплату: индексировать его нельзя, пока
// не заработал боевой магазин. Проверяется ровно то, что отдаёт Pages.
test('демо закрыто от индексации в опубликованном виде', () => {
  for (const page of ['index.html', '404.html']) {
    assert.match(read(page), /<meta name="robots" content="noindex">/, `${page}: в артефакте нет noindex`);
  }
  const rules = read('robots.txt').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  assert.ok(rules.includes('Disallow: /'), `robots.txt в артефакте не закрывает витрину: ${rules.join(' | ')}`);
});

test('баннер демо в опубликованной странице называет вещи своими именами', () => {
  const html = read('index.html');
  assert.match(html, /<aside class="site-demo-notice"[^>]*>[\s\S]{0,400}?Без реальной оплаты и отправки заказов\./,
    'демо-баннер в артефакте больше не говорит «Без реальной оплаты и отправки заказов»');
  assert.match(html, /\.site-demo-notice \{[^}]*background:\s*var\(--cured-ruby\)/,
    'баннер снова бледный: подложка не фирменным рубином');
  assert.match(html, /\.site-demo-notice \{[^}]*color:\s*var\(--fat-white\)/,
    'текст баннера не выбран контрастным токеном');
});

// Замыкание считается тем же свипом, что и сборка (манифест артефакта), а не вторым
// проходом по разметке: два независимых разбора расходятся молча.
test('каждый названный демо-ассет лежит в артефакте', () => {
  assert.ok(Array.isArray(manifest.refs) && manifest.refs.length >= 100,
    `свип назвал ${manifest.refs ? manifest.refs.length : 0} ассетов — проверка ничего не подтверждает`);
  const broken = manifest.refs.filter((ref) => !published.has(ref));
  assert.deepEqual(broken, [], `на демо эти ссылки ведут в пустоту: ${broken.slice(0, 8).join(', ')}`);
  const foreign = manifest.refs.filter((ref) => !/^(?:brand|img)\//.test(ref));
  assert.deepEqual(foreign, [], `демо ссылается на ассеты вне витрины: ${foreign.slice(0, 8).join(', ')}`);
});
