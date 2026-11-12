const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { root } = require('./helpers.cjs');

const git = (args, cwd) => execFileSync('git', args, { cwd: cwd || root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);

/**
 * `-o --ignored` отдаёт только игнорируемые файлы, а `-o` без `--ignored` — только
 * неигнорируемые. По отдельности каждый из вариантов не видит часть класса «файл лежит
 * рядом, его нет в git», а именно этот класс уезжает в docker-контекст и standalone.
 */
const filesMimoGit = (pathspecs, cwd) => [...new Set([
  ...git(['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard', '--', ...pathspecs], cwd),
  ...git(['-c', 'core.quotePath=false', 'ls-files', '--others', '--ignored', '--exclude-standard', '--', ...pathspecs], cwd),
])];

/**
 * Docker и standalone копируют рабочий каталог, а не git: всё, что лежит рядом и
 * не попало в репозиторий, уезжает в публичный артефакт молча. Единственный
 * надёжный инвариант — внутри публичного корня нечего прятать.
 */
test('в публичном корне нет ни одного файла мимо git', () => {
  const stray = filesMimoGit(['public']);
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

/**
 * Выборочная проверка четырёх образцов не поймала `.vercel/anonymous.json` с токеном
 * развёртывания: Dockerfile на стадии builder делает `COPY . .`, поэтому весь рабочий
 * каталог, которого нет в git, уезжает в артефакт. Инвариант один: всё мимо git накрыто
 * .dockerignore, кроме файлов, которые Next сам генерирует при сборке.
 */
test('весь рабочий каталог мимо git накрыт .dockerignore', () => {
  const stray = filesMimoGit(['.']);
  const generatedByBuild = new Set(['next-env.d.ts']);
  const uncovered = stray.filter((file) => !generatedByBuild.has(file) && !dockerIgnored(file));
  assert.deepEqual(uncovered, [], `${uncovered.length} файлов нет в git и нет в .dockerignore — они попадут в docker-контекст: ${uncovered.slice(0, 8).join(', ')}`);
  assert.ok(stray.length >= 1000, `у гейта пропала опора: файлов мимо git ${stray.length}`);
});

/**
 * Файл в публичном корне — это публичный URL. create-next-app оставил в public/ пять
 * своих логотипов, и продакшен отдавал их по прямым ссылкам, хотя ни одна страница их не
 * запрашивает. Ссылки считаются по тому, что реально рендерит витрина.
 */
test('из публичных корней не отдаётся ни одного файла без ссылки', () => {
  const corpusFiles = [];
  const collect = (dir, pattern) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full, pattern);
      else if (pattern.test(entry.name)) corpusFiles.push(full);
    }
  };
  for (const dir of ['app', 'components', 'lib']) collect(path.join(root, dir), /\.(?:tsx?|css|json)$/);
  const repo = path.join(root, '..');
  collect(path.join(repo, 'brand', 'fonts'), /\.css$/);
  for (const file of ['index.html', '404.html']) corpusFiles.push(path.join(repo, file));
  const corpus = corpusFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.ok(corpus.length > 500000, `у гейта пропала опора: корпус ссылок ${corpus.length} символов`);

  // Список файлов берётся из HEAD, а не из индекса. `ls-files` читает индекс, поэтому
  // уже запущенное, но ещё не закоммиченное удаление исчезало из проверки ровно в тот
  // момент, когда риск был максимальным: продакшен продолжал отдавать файл, а гейт
  // рапортовал чистоту. Именно так два осиротевших фото пережили прошлую чистку.
  const surfaces = [
    { label: 'shop/public', dir: root, dirs: ['public'], prefix: 'public/' },
    { label: 'корень Pages', dir: repo, dirs: ['img', 'brand'], prefix: '' },
  ];
  for (const surface of surfaces) {
    const tracked = git(['-c', 'core.quotePath=false', 'ls-tree', '-r', '--name-only', 'HEAD', '--', ...surface.dirs], surface.dir)
      .map((f) => f.slice(surface.prefix.length));
    assert.ok(tracked.length >= 140, `у гейта пропала опора: файлов в ${surface.label} ${tracked.length}`);
    const unreferenced = tracked.filter((file) => {
      if (corpus.includes(path.basename(file))) return false;
      return !corpus.includes(`/${file}`) && !corpus.includes(`./${file}`);
    });
    assert.deepEqual(unreferenced, [], `${surface.label}: продакшен отдаёт файлы без ссылки: ${unreferenced.join(', ')}`);
  }
});

test('каждая ссылка каталога ведёт в файл из git в обоих корнях, и сирот нет ни в одном', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lib', 'catalog.json'), 'utf8'));
  const entries = Array.isArray(catalog) ? catalog : [...catalog.products, ...catalog.previews];
  // Витрины две: Next отдаёт shop/public, GitHub Pages — корень репозитория. Раньше гейт
  // знал только про shop/public, и два осиротевших фото пережили чистку в публикации.
  const surfaces = [
    { label: 'shop/public', dir: root, dirs: ['public/img', 'public/brand'], prefix: 'public/' },
    { label: 'корень Pages', dir: path.join(root, '..'), dirs: ['img', 'brand'], prefix: '' },
  ];
  const referenced = new Set(entries.filter((p) => p.image).map((p) => p.image));
  assert.ok(referenced.size >= 100, `у гейта пропала опора: ссылок на фото ${referenced.size}`);

  const hashes = new Map();
  for (const surface of surfaces) {
    const tracked = new Set(git(['ls-files', '--', ...surface.dirs], surface.dir)
      .map((f) => f.slice(surface.prefix.length)));
    assert.deepEqual([...referenced].filter((file) => !tracked.has(file)), [],
      `${surface.label}: витрина ссылается на фото, которого нет в репозитории — покупатель увидит битую карточку`);
    // Ссылки живут только в img/ и brand/, поэтому сироты ищутся в тех же папках.
    const orphanCheck = new Set([...referenced].filter((file) => file.startsWith('img/')).map((file) => path.basename(file)));
    const orphans = [...tracked].filter((f) => f.startsWith('img/') && !orphanCheck.has(path.basename(f)));
    assert.deepEqual(orphans, [], `${surface.label}: в репозитории лежат фото без ссылки — их отдаёт продакшен`);
    for (const file of referenced) {
      const abs = path.join(surface.dir, surface.prefix + file);
      if (!fs.existsSync(abs)) continue;
      const digest = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
      if (hashes.has(file) && hashes.get(file) !== digest) {
        assert.fail(`${file}: два витринных корня отдают разные файлы с одним именем`);
      }
      hashes.set(file, digest);
    }
  }
  assert.equal(hashes.size, referenced.size, 'найдено фото не из обоих корней');
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
