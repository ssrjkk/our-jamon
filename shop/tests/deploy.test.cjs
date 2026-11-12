const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { root } = require('./helpers.cjs');

const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);

/**
 * Docker и standalone копируют рабочий каталог, а не git: всё, что лежит рядом и
 * не попало в репозиторий, уезжает в публичный артефакт молча. Единственный
 * надёжный инвариант — внутри публичного корня нечего прятать.
 */
test('в публичном корне нет ни одного файла мимо git', () => {
  const stray = git(['ls-files', '--others', '--ignored', '--exclude-standard', '--', 'public']);
  assert.deepEqual(stray, [], 'в public/ лежат файлы, которых нет в git — они попадут в docker-образ и standalone-бандл');
  const tracked = git(['ls-files', '--', 'public']);
  assert.ok(tracked.length >= 120, `у гейта пропала опора: отслеживаемых ассетов ${tracked.length}`);
});

function dockerPatterns() {
  return fs.readFileSync(path.join(root, '.dockerignore'), 'utf8')
    .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

function dockerIgnored(file) {
  const segments = file.split('/');
  return dockerPatterns().some((pattern) => {
    const source = pattern.split('/').map((part) => part.split('*').map(
      (literal) => literal.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('/');
    const match = new RegExp(`^${source}$`);
    // Каталог в .dockerignore исключает и всё его содержимое.
    return segments.some((_, index) => match.test(segments.slice(0, index + 1).join('/')));
  });
}

test('.dockerignore накрывает локальные данные, секреты и отчёты проверок', () => {
  for (const file of ['.env.local', 'data/orders.sqlite', 'test-results/live-check.mjs', 'public/img/domhamona-leg-08.webp']) {
    assert.equal(dockerIgnored(file), true, `${file} ушёл бы в docker-образ`);
  }
  assert.equal(dockerIgnored('lib/price.ts'), false, 'гейт стал ложным: рабочий код тоже под исключением');
  assert.equal(fs.existsSync(path.join(root, 'data')), true, 'в репозитории нет data/ — проверка выродилась');
});

test('каждая ссылка каталога ведёт в файл из git, и ни один файл не висит без ссылки', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lib', 'catalog.json'), 'utf8'));
  const entries = Array.isArray(catalog) ? catalog : catalog.products;
  const tracked = new Set(git(['ls-files', '--', 'public/img']).map((f) => path.basename(f)));

  const referenced = new Set();
  for (const product of entries) if (product.image) referenced.add(path.basename(product.image));
  assert.ok(referenced.size >= 100, `у гейта пропала опора: ссылок на фото ${referenced.size}`);

  assert.deepEqual([...referenced].filter((name) => !tracked.has(name)), [],
    'витрина ссылается на фото, которого нет в репозитории — покупатель увидит битую карточку');
  assert.deepEqual([...tracked].filter((name) => !referenced.has(name)), [],
    'в репозитории лежат фото, на которые никто не ссылается');
});

test('₽ за 100 г считается одним хелпером на обеих витринах', () => {
  const sites = [];
  const scan = (file, label) => fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
    if (/pricePerKg\s*\/\s*10\b/.test(line)) sites.push(`${label}:${index + 1}: ${line.trim()}`);
  });
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|html)$/.test(entry.name)) scan(full, path.relative(root, full));
    }
  };
  for (const dir of ['lib', 'components', 'app']) walk(path.join(root, dir));
  scan(path.join(root, '..', 'index.html'), 'index.html');

  const outsideHelper = sites.filter((site) => !/\bMath\.round\(pricePerKg \/ 10\)/.test(site));
  assert.deepEqual(outsideHelper, [], 'расчёт за 100 г продублирован в обход calcPricePer100g');
  assert.equal(sites.length, 2, `хелперов за 100 г должно быть по одному на витрину, найдено ${sites.length}`);
});
