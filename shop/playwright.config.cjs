const path = require('node:path');
const fs = require('node:fs');
const { defineConfig } = require('@playwright/test');
const output = path.join(__dirname, 'test-results');
fs.mkdirSync(output, { recursive: true });
const baseURL = 'http://127.0.0.1:3302';
const staticPort = process.env.E2E_STATIC_PORT || '8765';
const staticURL = 'http://127.0.0.1:' + staticPort;
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
      command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3302',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ...process.env,
        SHOP_MODE: 'demo', SHOP_URL: baseURL,
        ADMIN_PASSWORD: 'test-only-admin-passphrase',
        ORDERS_DB_PATH: dbPath, ORDERS_LEGACY_PATH: path.join(output, 'no-legacy-orders.json'),
        ONEC_API_URL: '', ONEC_TOKEN: '', TBANK_TERMINAL_KEY: '', TBANK_PASSWORD: '', TBANK_TAXATION: '', TBANK_VAT: '',
        DELIVERY_CDEK_RUB: '', DELIVERY_YANDEX_RUB: '', DELIVERY_DRIVEE_RUB: '', FREE_DELIVERY_FROM: '',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
    {
      command: 'node tests/static-server.cjs ' + staticPort,
      url: `${staticURL}/index.html`,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
