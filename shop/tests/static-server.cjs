// Раздаёт корень репозитория для проверки статической витрины index.html.
// Запуск: node tests/static-server.cjs [порт] (по умолчанию 8765).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const port = Number(process.argv[2]) || 8765;
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
    res.writeHead(200, {
      'Content-Type': types[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(port, '127.0.0.1', () => console.log(`static demo on http://127.0.0.1:${port}/`));
