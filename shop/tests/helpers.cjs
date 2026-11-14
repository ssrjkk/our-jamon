const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const sqlite = require('node:sqlite');
const root = path.resolve(__dirname, '..');

function createSystem(options = {}) {
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'test-results/unit-'));
  const keys = ['SHOP_MODE', 'SHOP_URL', 'ORDERS_DB_PATH', 'ORDERS_LEGACY_PATH', 'ADMIN_PASSWORD', 'RESERVATION_TTL_HOURS', 'ONEC_API_URL', 'ONEC_TOKEN', 'TBANK_TERMINAL_KEY', 'TBANK_PASSWORD', 'TBANK_TAXATION', 'TBANK_VAT', 'FREE_DELIVERY_FROM', 'DELIVERY_CDEK_RUB', 'DELIVERY_YANDEX_RUB', 'DELIVERY_DRIVEE_RUB'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  keys.forEach(key => delete process.env[key]);
  Object.assign(process.env, { SHOP_MODE: 'demo', SHOP_URL: 'http://localhost:3302', ORDERS_DB_PATH: options.dbPath || path.join(dir, 'orders.sqlite'), ORDERS_LEGACY_PATH: path.join(dir, 'orders.json'), ...options.env });
  if (options.legacy !== undefined) fs.writeFileSync(process.env.ORDERS_LEGACY_PATH, typeof options.legacy === 'string' ? options.legacy : JSON.stringify(options.legacy));
  const source = path.join(root, 'data/orders.json');
  const originalHash = fs.existsSync(source) ? crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex') : null;
  const oldFetch = global.fetch;
  global.fetch = async () => { throw new Error('External network is forbidden in tests'); };
  const connections = [];
  const jar = new Map();
  const cache = new Map();
  class Response {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.headers = new Headers(init.headers);
      this.cookieChanges = new Map();
      this.cookies = { set: (name, value, settings) => this.cookieChanges.set(name, { value, settings }) };
    }
    static json(body, init) { return new Response(body, init); }
  }
  class Database extends sqlite.DatabaseSync {
    constructor(...args) { super(...args); connections.push(this); }
  }
  function load(relative) {
    const file = path.isAbsolute(relative) ? relative : path.join(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const localRequire = id => {
      if (id === 'next/server') return { NextResponse: Response, connection: async () => {} };
      if (id === 'next/headers') return { cookies: async () => ({ get: name => jar.has(name) ? { value: jar.get(name) } : undefined }) };
      if (id === 'node:sqlite') return { ...sqlite, DatabaseSync: Database };
      const relative = id.startsWith('@/') ? path.join(root, id.slice(2)) : id.startsWith('.') ? path.resolve(path.dirname(file), id) : null;
      if (relative && relative.endsWith('.json')) return require(relative);
      if (relative) return load(relative + '.ts');
      return require(id);
    };
    new Function('require', 'module', 'exports', js)(localRequire, module, module.exports);
    return module.exports;
  }
  return {
    dir, load, jar,
    request: (body, url = 'http://localhost:3302/api/orders', headers = {}) => ({ json: async () => structuredClone(body), nextUrl: new URL(url), headers: new Headers({ 'content-type': 'application/json', ...headers }) }),
    context: id => ({ params: Promise.resolve({ id }) }),
    applyCookies: response => response.cookieChanges.forEach((cookie, name) => jar.set(name, cookie.value)),
    cleanup() {
      connections.forEach(db => { if (db.isOpen) db.close(); });
      global.fetch = oldFetch;
      previous.forEach((value, key) => value === undefined ? delete process.env[key] : process.env[key] = value);
      if (originalHash !== null) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'), originalHash, 'Real orders JSON was modified');
      fs.rmSync(dir, { recursive: true });
    },
  };
}

/**
 * Причина отказа, которую покупатель не видит, обязана оставаться в журнале сервера.
 * Тест читает именно журнал, а не текст ответа: строки console.error за время action.
 */
async function captureServerLog(action) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => { lines.push(args.map(String).join(' ')); };
  try { await action(); } finally { console.error = original; }
  return lines;
}

/**
 * Аргументы Math.round(...), где вес делится на 1000: ровно те записи, которыми
 * карточка расходилась с сервером. Скобки считаются по балансу, поэтому детектор
 * не зависит от того, в каком порядке стоят множитель и делитель.
 */
function priceWeightRounds(source) {
  const found = [];
  const open = 'Math.round('.length;
  for (let index = source.indexOf('Math.round('); index !== -1; index = source.indexOf('Math.round(', index + 1)) {
    let cursor = index + open;
    let depth = 1;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '(') depth += 1;
      else if (source[cursor] === ')') depth -= 1;
      if (depth === 0) break;
      cursor += 1;
    }
    const argument = source.slice(index + open, cursor);
    if (/\b1000\b/.test(argument) && /weight/i.test(argument)) found.push(argument);
  }
  return found;
}

module.exports = { createSystem, captureServerLog, root, priceWeightRounds };
