// Раздаёт корень репозитория для проверки статической витрины index.html.
// Запуск: node tests/static-server.cjs [порт] (по умолчанию 8765).
//
// STATIC_MUTATE='было=>стало@@было2=>стало2' подменяет подстроки в отдаваемом index.html.
// Разделитель пар — «@@», внутри пары — «=>»: и «;», и «=» встречаются в самой разметке
// (&nbsp;, атрибуты), поэтому обычными символами пары разложить нельзя.
// Нужно только доказательству, что браузерные гейты кусаются: подмену вносит сервер в
// памяти, а рабочий index.html не меняется — по этому пути пишет вторая сессия, и
// временная инъекция могла бы попасть в чужой коммит. Без переменной файл отдаётся
// байт в байт, а подмена, которой не за что зацепиться, рвёт ответ, а не молчит.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const port = Number(process.argv[2]) || 8765;
const mutations = (process.env.STATIC_MUTATE || '').split('@@').filter(Boolean).map((pair) => {
  const split = pair.indexOf('=>');
  if (split < 1) throw new Error(`STATIC_MUTATE: в паре «${pair}» нет разделителя было=>стало`);
  return [pair.slice(0, split), pair.slice(split + 2)];
});
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const page = path.join(root, 'index.html');
const mutated = () => {
  let html = fs.readFileSync(page, 'utf8');
  for (const [from, to] of mutations) {
    if (!html.includes(from)) throw new Error(`STATIC_MUTATE: «${from}» нет в index.html — подмене не за что зацепиться`);
    html = html.split(from).join(to);
  }
  return Buffer.from(html, 'utf8');
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const target = path.resolve(root, relative || 'index.html');
  if (target !== root && !target.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(target, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    const base = {
      'Content-Type': types[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    };
    if (mutations.length && target === page) {
      let body;
      try {
        body = mutated();
      } catch (mutationError) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(mutationError.message);
        return;
      }
      res.writeHead(200, { ...base, 'Content-Length': body.length });
      res.end(body);
      return;
    }
    res.writeHead(200, { ...base, 'Content-Length': stats.size });
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`static demo on http://127.0.0.1:${port}/${mutations.length ? ` (подмен: ${mutations.length})` : ''}`);
});
