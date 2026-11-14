# Наш Хамон — shop

Next.js 16 storefront and order processing for the deli shop. Requires Node.js 24.12–24.x. There is no demo default: `SHOP_MODE=demo` has to be set explicitly, and without it the shop expects real bank and 1C integrations.

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
| `SHOP_MODE` | `demo` marks orders paid without a bank charge; unset or `live` means real integrations, and `live` is the default |
| `SHOP_URL` | Canonical shop address; a confirmed HTTPS address is required for live payments |
| `ADMIN_PASSWORD` | Administrator secret, at least 16 characters |
| `ORDERS_DB_PATH` | Persistent SQLite file; default `data/orders.sqlite` |
| `ORDERS_LEGACY_PATH` | Optional legacy JSON to import; otherwise `orders.json` beside the database |
| `RESERVATION_TTL_HOURS` | Whole hours an unpaid order holds a piece; default 24 |
| `ONEC_API_URL`, `ONEC_TOKEN` | Live catalog endpoint and optional Bearer token |
| `TBANK_TERMINAL_KEY`, `TBANK_PASSWORD` | Live acquiring credentials |
| `TBANK_TAXATION`, `TBANK_VAT` | Actual fiscal settings agreed with the bank and seller |
| `DELIVERY_CDEK_RUB`, `DELIVERY_YANDEX_RUB`, `DELIVERY_DRIVEE_RUB` | Approved fixed tariffs; empty means manager confirmation before payment |
| `FREE_DELIVERY_FROM` | Approved free courier threshold; empty means no such promise |

In live mode, missing or invalid 1C data does not fall back to demo inventory. `GET ONEC_API_URL` returns `Product[]` or `{ "products": Product[] }`, matching `lib/types.ts`. Orders and confirmed payment status are posted to `ONEC_API_URL/orders`. Failed synchronization is visible to the administrator and can be retried.

Cart prices are quoted by `POST /api/cart`. Checkout rejects an outdated accepted total. Fixed-price legs retain their unit price; all actual weights and unknown shipping cost are confirmed together before payment. Signed bank notifications only mark an order paid on `CONFIRMED` when its exact amount matches; `AUTHORIZED` is not payment confirmation. Demo payment uses a separate authorized order action, never an unsigned bank notification.

Internet payment is recorded as full prepayment. Validate the final handover receipt through the actual fiscal/1C setup before enabling live sales.

A signed notification marks an order paid when the terminal signature verifies and `Amount` equals the order total in kopecks. The payment ID is recorded, not required to be known: the bank reports IDs whose `Init` response the shop never read (timeout, 5xx), and those charges still have to be accepted. Every reported ID lands in the order's payment registry, which is what blocks a local cancel, and a confirmed payment on a link the order no longer waits for is queued in `refundPaymentIds` for the bank to return.

Payment links are copied and passed to customers manually. Automatic messenger delivery and CDEK point booking are not implemented; the interface does not claim otherwise.

### Rate limiting and the reverse proxy

`POST /api/cart` (60 requests/minute), `POST /api/orders` (20/minute) and `POST /api/admin/login` (10 failed passwords/15 minutes plus a shared 30/hour bucket) answer `429` with `Retry-After`. The bucket key is the address the proxy writes into `X-Forwarded-For`; a request without any proxy header has no known address and is not throttled, so several tabs or one NAT are never blocked together. That means the limits only exist when the proxy in front of the shop sets `X-Forwarded-For` (or `X-Real-IP`) to the real client — behind nginx, `proxy_set_header X-Forwarded-For $remote_addr;`. Only the last hop is counted: everything to its left is written by the client and cannot buy extra quota. The administrator login bucket is fed by failed attempts only, so a correct password never spends it.

A piece held by an unpaid order returns to the storefront `RESERVATION_TTL_HOURS` after the last write to that order, not after the order was created: weight confirmation restarts the clock, a forgotten checkout releases the piece. Expired reservations are dropped on any read or write, so no separate cron process is needed. A paid order keeps its piece until it is cancelled.

The open administrator panel refreshes its order list by itself: every 20 seconds and immediately when the tab becomes visible again. A tick is skipped while any action is running, so polling never overwrites an in-flight weight confirmation or cancel.

### Health endpoint

`GET /api/health` is public and answers `200` while the order database is readable, `503` when it is not; `Cache-Control: no-store` keeps each check fresh. The body contains only the mode, the database state and how the catalog is filled (`origin`, `notice`, `checkedAt`) — no orders, names, phones or file paths. `Dockerfile` points its `HEALTHCHECK` at this route, so a container with an unreadable database is reported unhealthy instead of pretending to be alive. Reasons for a failure stay in the server log.

Server-side refusals that the storefront must not explain (`503` from cart, order creation, order update, payment initialization, a signed bank notification with no matching order) are written to the server log under a scope (`[cart]`, `[tbank-notify]`, …) with the original error; the customer keeps receiving the generic message.

## Storage and deployment

SQLite uses transactions, WAL and a unique piece reservation. An existing legacy JSON is imported once and remains untouched; invalid legacy data fails instead of resetting orders. Keep the SQLite file on a persistent local disk. Use SQLite's backup API, or stop the server before copying the database and WAL; do not copy a changing database independently. This deployment is for one host, not a stateless multi-region platform.

```bash
docker build -t nash-hamon .
docker run --env-file .env.local -p 3000:3000 -v nash-hamon-orders:/app/data nash-hamon
```

The image uses Node 24, runs as a non-root user and does not bundle order data or secrets. Do not enable live payments before validating the actual 1C contract, acquiring/fiscal settings, tariffs and seller's legal details.

## По-русски

Магазин по умолчанию работает в живом режиме: `SHOP_MODE=demo` нужно выставить явно, иначе лавка ждёт настоящую выгрузку 1С, реквизиты и настройки эквайринга. Для рабочего режима нужны реальные цены, согласованные тарифы и реквизиты продавца; секреты вводите локально, а не в переписке.

Публичные ручки `POST /api/cart` (60 в минуту), `POST /api/orders` (20 в минуту) и вход администратора (10 неверных паролей за 15 минут плюс общий счётчик на 30 в час) отвечают `429` с `Retry-After`. Окно считается по адресу из `X-Forwarded-For` — берётся только последний адрес в цепочке, всё левее написала сама сторона, отправившая запрос. Без заголовка от прокси адрес неизвестен, и лимит не применяется: несколько вкладок одного покупателя или целый NAT не окажутся заблокированными. Значит лимиты работают только тогда, когда прокси перед магазином проставляет `X-Forwarded-For` (у nginx — `proxy_set_header X-Forwarded-For $remote_addr;`). Общий счётчик входа пополняется только неудачными попытками, поэтому верный пароль его не расходует.

Кусок остаётся за неоплаченным заказом `RESERVATION_TTL_HOURS` часов, считая от последней записи в этот заказ: согласование веса даёт покупателю новое время, а забытый заказ освобождает полку сам, без отдельного планировщика. Просрочка снимается при любом обращении к базе. Оплаченный заказ удерживает кусок до отмены.

Открытая админка обновляет список заказов сама — каждые 20 секунд и сразу при возврате на вкладку. Такт пропускается, пока идёт любое действие, поэтому опрос не перезаписывает подтверждение веса или отмену, которые менеджер ещё не закончил.

`GET /api/health` — публичная ручка готовности: `200`, пока читается база заказов, и `503`, если нет; ответ всегда с `Cache-Control: no-store`. Наружу выходят только режим работы, состояние базы и источник каталога (`origin`, `notice`, `checkedAt`) — без заказов, имён, телефонов и путей к файлам. На неё же смотрит `HEALTHCHECK` в Dockerfile, поэтому контейнер с нерабочей базой не притворяется живым.

Отказ, о котором покупатель не должен знать подробностей (503 корзины, создания и правки заказа, сбой банка, подписанное уведомление без пары), записывается в журнал сервера с областью (`[cart]`, `[tbank-notify]` и т. д.) и исходной причиной; на витрине остаётся общий вежливый текст.

Имя, телефон и адрес заказа доступны только по его секретной ссылке/защищённой cookie или администратору. Веса и неизвестная стоимость доставки подтверждаются одним действием. Если у позиции цена за штуку, а не за килограмм, подтверждение веса её не меняет.

Шрифт Geologica подключён с кириллицей. Надпись бренда сохранена в настоящем векторном логотипе; для применения Pizza Hut Font Regular ко всем заголовкам ещё нужен лицензированный файл шрифта. До его получения заголовки используют явно временный Playfair Display.
