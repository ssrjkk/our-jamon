const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createSystem, root } = require('./helpers.cjs');

const git = (args, cwd) => execFileSync('git', args, { cwd: cwd || root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim().split('\n').filter(Boolean);

/**
 * `-o --ignored` отдаёт только игнорируемые файлы, а `-o` без `--ignored` — только
 * неигнорируемые. По отдельности каждый из вариантов не видит часть класса «файл лежит
 * рядом, его нет в git», а именно этот класс уезжает в docker-контекст и standalone.
 *
 * Игнорируемое перечисляется с `--directory`: без него git разворачивает `.next/` и
 * `node_modules/` попосточно, список переваливает за 1 МБ, и гейт падает с ENOBUFS
 * просто потому, что сборка подросла. Свёртка ничего не теряет: `.dockerignore` тоже
 * накрывает путь префиксом, а каталог сворачивается лишь тогда, когда в нём нет ни
 * одного отслеживаемого файла — там и прятаться нечему частичным исключением.
 */
const filesMimoGit = (pathspecs, cwd) => {
  const plain = git(['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard', '--', ...pathspecs], cwd);
  const ignored = git(['-c', 'core.quotePath=false', 'ls-files', '--others', '--ignored', '--directory', '--exclude-standard', '--', ...pathspecs], cwd);
  return { all: [...new Set([...plain, ...ignored])], ignored };
};

/**
 * Docker и standalone копируют рабочий каталог, а не git: всё, что лежит рядом и
 * не попало в репозиторий, уезжает в публичный артефакт молча. Единственный
 * надёжный инвариант — внутри публичного корня нечего прятать.
 */
test('в публичном корне нет ни одного файла мимо git', () => {
  const stray = filesMimoGit(['public']).all;
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
  const { all: stray, ignored } = filesMimoGit(['.']);
  const generatedByBuild = new Set(['next-env.d.ts']);
  const uncovered = stray.filter((file) => !generatedByBuild.has(file) && !dockerIgnored(file));
  assert.deepEqual(uncovered, [], `${uncovered.length} файлов нет в git и нет в .dockerignore — они попадут в docker-контекст: ${uncovered.slice(0, 8).join(', ')}`);
  // Опора гейта — не длина списка (она зависела от того, сколько мусора накопила
  // сборка, и рушилась по maxBuffer), а то, что перечисление реально видит
  // обязательные локальные каталоги: без них проверка выродилась бы в пустоту.
  for (const must of ['node_modules/', 'data/']) {
    assert.ok(ignored.includes(must), `у гейта пропала опора: перечисление мимо git не видит ${must}`);
  }
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

/**
 * Гейт каталога сверяет с git только фото позиций. Остальные локальные ассеты —
 * логотипы, фото лавки, шрифты, gsap — перечислены прямо в разметке и в css: удаление
 * файла из своего корня рвёт картинку молча, потому что ни сборка, ни рендер файл не
 * требуют. Путь резолвится от каталога файла-источника, поэтому url() в
 * brand/fonts/fonts.css ищется в brand/fonts/, а не в корне.
 */
test('ни одна локальная ссылка на ассет не ведёт в пустоту, общие файлы совпадают байт в байт', () => {
  const repo = path.join(root, '..');
  const sources = [];
  const walk = (dir, label, surface) => {
    for (const entry of fs.readdirSync(path.join(dir, label), { withFileTypes: true })) {
      const rel = `${label}/${entry.name}`;
      if (entry.isDirectory()) walk(dir, rel, surface);
      else if (surface === 'Next' ? /\.(tsx?|css)$/.test(entry.name) : /\.css$/.test(entry.name)) {
        sources.push({ from: rel, surface });
      }
    }
  };
  for (const dir of ['app', 'components', 'lib']) walk(root, dir, 'Next');
  walk(repo, 'brand', 'Pages');
  for (const file of fs.readdirSync(repo).filter((f) => f.endsWith('.html'))) {
    sources.push({ from: file, surface: 'Pages' });
  }

  const LINK = /(?:src|href)=["'`]((?!https?:|\/\/|#|data:)[\w./-]+\.(?:webp|png|jpe?g|svg|gif|avif|ico|css|woff2?|js|json|xml))["'`>]|url\(["']?((?!https?:|\/\/|#|data:)[\w./-]+\.(?:webp|png|jpe?g|svg|gif|avif|css|woff2?))["']?\)/g;
  const links = new Map();
  for (const { from, surface } of sources) {
    const text = fs.readFileSync(path.join(surface === 'Next' ? root : repo, from), 'utf8');
    for (const match of text.matchAll(LINK)) {
      const url = (match[1] || match[2]).split('?')[0].split('#')[0];
      // У Next относительных путей в коде нет; если появятся — резолвим их от public,
      // как это делает браузер на главном роуте. Абсолютный путь всегда от корня витрины.
      const resolved = url.startsWith('/')
        ? url.slice(1)
        : path.posix.normalize(`${path.posix.dirname(from)}/${url}`);
      const key = `${surface}:${resolved}`;
      if (!links.has(key)) links.set(key, { resolved, surface, from: new Set() });
      links.get(key).from.add(from);
    }
  }
  assert.ok(links.size >= 20, `локальных ссылок на ассеты стало ${links.size} — гейт теряет опору`);

  // Списки берутся из HEAD, а не из индекса: запущенное, но не закоммиченное удаление
  // не должно исчезать из проверки ровно в момент максимального риска.
  const trackedBySurface = {
    Pages: new Set(git(['-c', 'core.quotePath=false', 'ls-tree', '-r', '--name-only', 'HEAD'], repo)),
    Next: new Set(git(['-c', 'core.quotePath=false', 'ls-tree', '-r', '--name-only', 'HEAD', '--', 'public'], root)
      .map((f) => f.replace(/^public\//, ''))),
  };
  const broken = [];
  for (const { resolved, surface, from } of links.values()) {
    if (!trackedBySurface[surface].has(resolved)) broken.push(`${surface} ${resolved} <= ${[...from].join(' ')}`);
  }
  assert.deepEqual(broken, [], 'витрина ссылается на ассет, которого нет в её git-корне — покупатель получит 404 вместо картинки');

  // Общие для двух корней ассеты должны совпадать: правка логотипа в одном корне
  // меняет картинку только у одной половины покупателей.
  const shared = new Map();
  for (const { resolved, surface } of links.values()) {
    shared.set(resolved, new Set([...(shared.get(resolved) || []), surface]));
  }
  const digest = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  const bothRoots = [...shared].filter(([, list]) => list.size > 1).map(([url]) => url);
  assert.ok(bothRoots.length >= 5, `ассетов, лежащих в двух корнях, осталось ${bothRoots.length} — сверять нечего`);
  const drifted = [];
  for (const url of bothRoots) {
    const pagesFile = path.join(repo, url);
    const shopFile = path.join(root, 'public', url);
    if (!fs.existsSync(pagesFile) || !fs.existsSync(shopFile)) continue;
    if (digest(pagesFile) !== digest(shopFile)) drifted.push(url);
  }
  assert.deepEqual(drifted, [], 'один и тот же ассет в двух корнях разный: витрины рисуют разные картинки');
});

// Переезд на домен обязан оставаться одной заменой SHOP_URL: адрес витрины определён
// в одном месте, а карта сайтов накрывает каждый публичный маршрут. Пропущенный
// fallback продолжает печатать GitHub Pages как канонический, а маршрут без записи
// в sitemap просто не индексируется.
test('адрес витрины задан один раз, карта сайтов накрывает все публичные маршруты', async () => {
  const system = createSystem();
  try {
    const { siteUrl } = system.load('lib/config.ts');
    const { default: robots } = system.load('app/robots.ts');
    const { default: sitemap } = system.load('app/sitemap.ts');
    const base = new URL(siteUrl());
    const entries = await sitemap();
    const paths = entries.map((entry) => {
      const url = new URL(entry.url);
      assert.equal(url.origin, base.origin, 'запись карты сайтов ведёт не на адрес витрины');
      return url.pathname;
    });

    const skip = new Set(['node_modules', '.next', 'test-results', 'data']);
    const sources = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(file); }
        else if (/\.(ts|tsx)$/.test(entry.name)) sources.push(file);
      }
    };
    for (const dir of ['app', 'components', 'lib']) walk(path.join(root, dir));
    const rel = (file) => path.relative(root, file).replace(/[/\\]/g, '/');
    assert.ok(sources.length >= 40, `свип видел только ${sources.length} файлов исходников — проверка потеряла опору`);
    const secondAddress = sources.filter((file) => rel(file) !== 'lib/config.ts'
      && (/github\.io/.test(fs.readFileSync(file, 'utf8')) || /const SITE_URL\b/.test(fs.readFileSync(file, 'utf8'))));
    assert.deepEqual(secondAddress.map(rel), [], 'адрес витрины задан в обход siteUrl() из lib/config.ts');
    assert.match(fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8'), /metadataBase: new URL\(siteUrl\(\)\)/,
      'metadataBase больше не берёт адрес из siteUrl()');

    const appRoot = path.join(root, 'app');
    const pages = [];
    const walkRoutes = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walkRoutes(file);
        else if (entry.name === 'page.tsx') pages.push(file);
      }
    };
    walkRoutes(appRoot);
    const routes = pages.map((file) => {
      const folder = path.relative(appRoot, file).replace(/[/\\]/g, '/').replace(/page\.tsx$/, '').replace(/\/$/, '');
      return `/${folder}`;
    });
    assert.ok(routes.length >= 6, `маршрутов приложения осталось ${routes.length} — свип теряет опору`);

    const disallow = robots().rules.disallow;
    const isPrivate = (route) => disallow.some((prefix) => (prefix.endsWith('/')
      ? route.startsWith(prefix)
      : route === prefix || route.startsWith(`${prefix}/`)));
    assert.deepEqual(routes.filter(isPrivate).sort(), ['/admin', '/cart', '/order/[id]'],
      'список закрытых от индексации маршрутов изменился — сверьте robots и карту сайтов');
    const unmapped = routes.filter((route) => route.includes('[') && !isPrivate(route) && route !== '/product/[id]');
    assert.deepEqual(unmapped, [], 'появился динамический маршрут, который карта сайтов не раскрывает');

    const { getProducts } = system.load('lib/products.ts');
    const products = await getProducts();
    const expected = [...new Set([...routes.filter((route) => !isPrivate(route) && !route.includes('[')),
      ...products.map((product) => `/product/${product.id}`)])];
    assert.ok(expected.length >= 100, `публичных адресов осталось ${expected.length} — сверка была бы пустой`);
    assert.deepEqual([...paths].sort(), [...expected].sort(), 'карта сайтов разошлась с публичными маршрутами приложения');
  } finally {
    system.cleanup();
  }
});

// Заголовки безопасности — часть публичного контракта: их отдаёт конфиг, а не код страниц,
// и молча потерять CSP или HSTS можно на любой правке next.config.ts.
test('конфиг отдаёт CSP и HSTS в проде и не отдаёт CSP в dev', async () => {
  const system = createSystem();
  const original = process.env.NODE_ENV;
  try {
    const { default: config } = system.load('next.config.ts');
    const read = async (env) => {
      process.env.NODE_ENV = env;
      const [entry] = await config.headers();
      return new Map(entry.headers.map((header) => [header.key.toLowerCase(), header.value]));
    };
    const production = await read('production');
    assert.equal(production.get('x-content-type-options'), 'nosniff');
    assert.equal(production.get('x-frame-options'), 'DENY');
    assert.match(production.get('strict-transport-security'), /^max-age=31536000/, 'HSTS короче года — страница переживает смену сертификата без политики');
    const csp = production.get('content-security-policy');
    assert.ok(csp, 'в production нет Content-Security-Policy');
    for (const directive of ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:", "font-src 'self' data:", "connect-src 'self'", "form-action 'self'",
      "frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"]) {
      assert.ok(csp.split('; ').includes(directive), `CSP потеряла директиву ${directive}`);
    }
    assert.equal(csp.split('; ').length, 10, 'состав CSP изменился — сверьте с замером в браузере');
    assert.doesNotMatch(csp, /unsafe-eval/, 'eval в CSP открывает всю страницу любому встроенному скрипту');
    assert.doesNotMatch(csp, /\*|https?:\/\//, 'CSP разрешила чужой домен или источник-подстановку');
    const development = await read('development');
    assert.equal(development.has('content-security-policy'), false,
      'CSP в dev глушит HMR и eval-карты React: локальные проверки падают не из-за кода');
    assert.equal(development.get('strict-transport-security'), production.get('strict-transport-security'),
      'базовые заголовки обязаны совпадать в обоих режимах');
  } finally {
    process.env.NODE_ENV = original;
    system.cleanup();
  }
});

// Готовность контейнера читает тот же маршрут, что и внешний мониторинг. Переименованный
// путь молчит: docker бесконечно перезапускает контейнер, а в журнале приложения нет ни
// одной строчки — базовая проверка не должна зависеть от угадывания.
test('HEALTHCHECK контейнера ведёт в существующий публичный маршрут', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const line = dockerfile.split(/\r?\n/).find((row) => row.startsWith('HEALTHCHECK'));
  assert.ok(line, 'в Dockerfile нет HEALTHCHECK: контейнер с нерабочей базой притворяется живым');
  const target = line.match(/'(\/[a-z][a-z0-9/_-]*)'/)?.[1];
  assert.equal(target, '/api/health', 'проверка готовности зовёт не тот маршрут');
  const routeFile = path.join(root, 'app', ...target.split('/').filter(Boolean), 'route.ts');
  assert.ok(fs.existsSync(routeFile), `маршрут ${target} из HEALTHCHECK не существует`);
  const source = fs.readFileSync(routeFile, 'utf8');
  assert.doesNotMatch(source, /isAdmin|cookies\(\)/, 'готовность под авторизацией: контейнер никогда не станет ready');
  assert.match(source, /await connection\(\)/, 'маршрут готовности закеширован — мониторинг видит одну и ту же дату');
  assert.match(source, /Cache-Control': 'no-store/, 'ответ готовности кэшируется между проверками');
  assert.match(dockerfile, /^CMD \["node", "server\.js"\]$/m, 'запуск standalone-сервера изменился — сверьте порт HEALTHCHECK');
});
