# Наш Хамон

A deli storefront for «Наш Хамон» at Saint Petersburg's Sytny Market. The repository contains an intentional static demo and the Next.js order-processing application, not two competing production stores.

## Run

- Static demo: serve the repository root with `node shop/tests/static-server.cjs 8765`, then open `http://localhost:8765`. Checkout is a labelled simulation: no real order submission or payment.
- Application: follow [shop/README.md](shop/README.md). Node.js 24.12–24.x is required; `npm run dev` in `shop/` starts the local application.

## Storefront

Full catalog with search and applicable country/age filters; average pieces and requested cuts; fixed-price legs; packaged goods; responsive basket and checkout. «Наша лавка», «О нас» and «Выбор покупателей» use the supplied interior photo and clearly labelled example selections, not invented customer reviews.

Brand color: `#5B2824`. Geologica serves body text and semibold captions with Cyrillic. The actual outlined logo is retained; a licensed Pizza Hut Font Regular file is still required for web headings, which temporarily use Playfair Display. Real product/customer photos, confirmed retail prices and legal details must come from the shop.

## По-русски

`index.html` — демо для просмотра и согласования. Демо автономно: шрифты с кириллицей лежат в `brand/fonts/`, GSAP — в `brand/vendor/`, внешних запросов нет. `shop/` — приложение с серверным расчётом корзины, закрытыми данными заказов, SQLite и подтверждением веса. Реальный режим включается только явной настройкой; без неё оплата имитируется и в 1С ничего не отправляется.

Каталог остаётся вкладками, без длинной ленты. Целые ноги и палеты идут превью без цены: наличие и стоимость уточняет лавка. Точный вес и неподтверждённую доставку согласуют до оплаты. Истории и подборки используют данные каталога.

Перед рабочим запуском нужны подтверждённые данные 1С, тарифы, реквизиты, настройки банка и файл шрифта с разрешением на веб-использование. Автоматическая отправка ссылок в мессенджеры и бронирование ПВЗ не подключены — ссылки передаются покупателю вручную.

Контакты: Сытнинская ул., 4П, фуд-аллея рынка «Сытный»; вт–вс 10:30–20:30; +7 (906) 896-00-99; 619896@mail.ru.
