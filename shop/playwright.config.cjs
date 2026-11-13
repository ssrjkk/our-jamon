const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { defineConfig } = require('@playwright/test');
const { ADMIN_PASSWORD } = require('./tests/e2e/helpers.cjs');
const output = path.join(__dirname, 'test-results');
fs.mkdirSync(output, { recursive: true });

// На этой машине работают несколько сессий сразу, и любой localhost-порт может оказаться
// занятым чужим сервером: гейт падал с невнятным EADDRINUSE, когда чужой
// `python -m http.server` держал 8765. Берём первый свободный порт и выдаём его и
// серверу, и тестам из одного места — адрес теста не может разойтись с реальным портом.
function freePort(start) {
  for (let port = start; port < start + 25; port += 1) {
    try {
      execFileSync(process.execPath, ['-e',
        `const s=require('net').createServer();s.on('error',()=>process.exit(3));s.listen(${port},'127.0.0.1',()=>s.close(()=>process.exit(0)));`,
      ], { stdio: 'ignore', timeout: 8000 });
      return port;
    } catch {
      // порт занят или недоступен — пробуем следующий
    }
  }
  throw new Error(`Нет свободного порта в диапазоне ${start}–${start + 24}`);
}

// Конфиг вычисляется не один раз: сначала в раннере, потом в каждом воркере. Без
// закрепления портов воркер находит поднятые раннером серверы занятыми и уезжает на
// следующий порт, а тесты стучатся в пустоту (ECONNREFUSED). Поэтому порты выбираются
// один раз и передаются дальше через окружение.
const wantedAppPort = Number(process.env.E2E_APP_PORT || 3302);
const wantedStaticPort = Number(process.env.E2E_STATIC_PORT || 8765);
if (process.env.E2E_PORTS_PINNED !== '1') {
  process.env.E2E_APP_PORT = String(freePort(wantedAppPort));
  process.env.E2E_STATIC_PORT = String(freePort(wantedStaticPort));
  process.env.E2E_PORTS_PINNED = '1';
}
const appPort = Number(process.env.E2E_APP_PORT);
const staticPort = Number(process.env.E2E_STATIC_PORT);
const baseURL = `http://127.0.0.1:${appPort}`;
// Тестам отдаём тот же адрес, что и серверу: две разные переменные расходились молча.
process.env.E2E_STATIC_URL = `http://127.0.0.1:${staticPort}`;
const dbPath = path.join(output, `browser-${Date.now()}.sqlite`);

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.cjs',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 3,
  outputDir: './test-results/playwright',
  reporter: [['list'], ['json', { outputFile: './test-results/browser-results.json' }]],
  use: {
    baseURL,
    channel: 'chrome',
    headless: true,
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ...(process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH } } : {}),
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile', use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
  webServer: [
    {
      command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${appPort}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ...process.env,
        SHOP_MODE: 'demo', SHOP_URL: baseURL,
        ADMIN_PASSWORD,
        ORDERS_DB_PATH: dbPath, ORDERS_LEGACY_PATH: path.join(output, 'no-legacy-orders.json'),
        ONEC_API_URL: '', ONEC_TOKEN: '', TBANK_TERMINAL_KEY: '', TBANK_PASSWORD: '', TBANK_TAXATION: '', TBANK_VAT: '',
        DELIVERY_CDEK_RUB: '', DELIVERY_YANDEX_RUB: '', DELIVERY_DRIVEE_RUB: '', FREE_DELIVERY_FROM: '',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
    {
      command: 'node tests/static-server.cjs ' + staticPort,
      url: `${process.env.E2E_STATIC_URL}/index.html`,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
