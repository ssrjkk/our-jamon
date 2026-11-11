// Собирает standalone-бандл из результатов next build: серверу нужны .next/static и public рядом с server.js.
// Запуск: npm run build:standalone
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const standalone = join(root, '.next', 'standalone');

if (!existsSync(join(standalone, 'server.js'))) {
  console.error('Нет .next/standalone/server.js — сначала выполните next build с output: standalone.');
  process.exit(1);
}

for (const [from, to] of [[join(root, '.next', 'static'), join(standalone, '.next', 'static')], [join(root, 'public'), join(standalone, 'public')]]) {
  if (!existsSync(from)) { console.error(`Нет ${from.replace(root + '/', '')} — сборка неполная.`); process.exit(1); }
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

console.log('standalone готов:', standalone);
