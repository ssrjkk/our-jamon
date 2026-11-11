# Наш Хамон — shop

Next.js 16 storefront and order processing for the deli shop. Requires Node.js 24.12–24.x. The default mode is an explicit demo: no real bank payments or 1C writes.

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The default development address is `http://localhost:3000`. Update `SHOP_URL` if you use another port. Administrator login remains disabled until `ADMIN_PASSWORD` contains a secret of at least 16 characters; there is no default password.

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm run build:standalone` produces the self-hosted bundle: `next build` plus `scripts/pack-standalone.mjs`, which places `.next/static` and `public` next to `.next/standalone/server.js`. Run that directory with `HOSTNAME`, `PORT`, `SHOP_MODE`, `ORDERS_DB_PATH` and the payment/1C variables from Configuration; `node .next/standalone/server.js` alone is not enough because the client assets and the public images live outside the traced server output.

Browser tests use installed Google Chrome and an isolated SQLite database under ignored `test-results/`; they never use the shop's real order files. They cover 360/768/1440 px, checkout, order privacy, weight confirmation, navigation and accessibility, and they check both storefronts: the application plus the static demo, which `npm run test:e2e` serves from the repository root on port 8765. Every expected article, price and count is derived from `lib/catalog.json`, which is built from the supplier price list — the specs contain no hand-written prices.

## Configuration

| Variable | Meaning |
|---|---|
| `SHOP_MODE` | `demo` by default; `live` explicitly enables real integrations |
| `SHOP_URL` | Canonical shop address; a confirmed HTTPS address is required for live payments |
| `ADMIN_PASSWORD` | Administrator secret, at least 16 characters |
| `ORDERS_DB_PATH` | Persistent SQLite file; default `data/orders.sqlite` |
| `ORDERS_LEGACY_PATH` | Optional legacy JSON to import; otherwise `orders.json` beside the database |
| `ONEC_API_URL`, `ONEC_TOKEN` | Live catalog endpoint and optional Bearer token |
| `TBANK_TERMINAL_KEY`, `TBANK_PASSWORD` | Live acquiring credentials |
| `TBANK_TAXATION`, `TBANK_VAT` | Actual fiscal settings agreed with the bank and seller |
| `DELIVERY_CDEK_RUB`, `DELIVERY_YANDEX_RUB`, `DELIVERY_DRIVEE_RUB` | Approved fixed tariffs; empty means manager confirmation before payment |
| `FREE_DELIVERY_FROM` | Approved free courier threshold; empty means no such promise |

In live mode, missing or invalid 1C data does not fall back to demo inventory. `GET ONEC_API_URL` returns `Product[]` or `{ "products": Product[] }`, matching `lib/types.ts`. Orders and confirmed payment status are posted to `ONEC_API_URL/orders`. Failed synchronization is visible to the administrator and can be retried.

Cart prices are quoted by `POST /api/cart`. Checkout rejects an outdated accepted total. Fixed-price legs retain their unit price; all actual weights and unknown shipping cost are confirmed together before payment. Signed bank notifications only mark the matching amount/payment ID as paid on `CONFIRMED`; `AUTHORIZED` is not payment confirmation. Demo payment uses a separate authorized order action, never an unsigned bank notification.

Internet payment is recorded as full prepayment. Validate the final handover receipt through the actual fiscal/1C setup before enabling live sales.

Payment links are copied and passed to customers manually. Automatic messenger delivery and CDEK point booking are not implemented; the interface does not claim otherwise.

## Storage and deployment

SQLite uses transactions, WAL and a unique piece reservation. An existing legacy JSON is imported once and remains untouched; invalid legacy data fails instead of resetting orders. Keep the SQLite file on a persistent local disk. Use SQLite's backup API, or stop the server before copying the database and WAL; do not copy a changing database independently. This deployment is for one host, not a stateless multi-region platform.

```bash
docker build -t nash-hamon .
docker run --env-file .env.local -p 3000:3000 -v nash-hamon-orders:/app/data nash-hamon
```

The image uses Node 24, runs as a non-root user and does not bundle order data or secrets. Do not enable live payments before validating the actual 1C contract, acquiring/fiscal settings, tariffs and seller's legal details.

## По-русски

По умолчанию магазин работает в явном демо-режиме без реальных платежей и отправки в 1С. Для рабочего режима нужны настоящая выгрузка и цены, реквизиты, согласованные тарифы и настройки эквайринга; вводите секреты локально, а не в переписке.

Имя, телефон и адрес заказа доступны только по его секретной ссылке/защищённой cookie или администратору. Веса и неизвестная стоимость доставки подтверждаются одним действием. Если у позиции цена за штуку, а не за килограмм, подтверждение веса её не меняет.

Шрифт Geologica подключён с кириллицей. Надпись бренда сохранена в настоящем векторном логотипе; для применения Pizza Hut Font Regular ко всем заголовкам ещё нужен лицензированный файл шрифта. До его получения заголовки используют явно временный Playfair Display.
