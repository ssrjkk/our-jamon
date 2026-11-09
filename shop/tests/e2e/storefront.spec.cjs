const { test, expect, request: requestFactory } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Ожидания вычисляются из собранного прайса 0711 (lib/catalog.json).
// В этом файле нет артикулов, цен и количеств, придуманных для теста.
const catalog = require('../../lib/catalog.json');
const root = path.resolve(__dirname, '../..');
const shots = path.join(root, 'test-results/screenshots');
fs.mkdirSync(shots, { recursive: true });
const original = path.join(root, 'data/orders.json');
const originalHash = fs.existsSync(original) ? crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex') : null;
const staticURL = process.env.E2E_STATIC_URL || 'http://127.0.0.1:8765';

const PRICED = catalog.products;
const PENDING = catalog.previews;
const ENTRIES = new Map([...PRICED, ...PENDING].map((entry) => [entry.id, entry]));
const CATEGORY_TITLES = Object.fromEntries(catalog.categories.map((category) => [category.cat, category.title]));
const KITS = Object.fromEntries(catalog.kits.map((kit) => [kit.id, kit]));
const CATS = catalog.categories.map((category) => category.cat);

const rateOf = (id) => ENTRIES.get(id).pricePerKg;
const packOf = (id, index = 0) => ENTRIES.get(id).packs[index];
const cutPrice = (id, weightG) => Math.round(weightG * rateOf(id) / 1000);
const per100 = (id) => Math.round(packOf(id).price * 100 / packOf(id).weightG);
const kitPrice = (id) => KITS[id].items.reduce((sum, item) => sum + packOf(item.productId, item.packIdx).price, 0);
const deptCount = (cat) => ({
  priced: PRICED.filter((product) => product.category === cat).length,
  pending: PENDING.filter((entry) => entry.category === cat).length,
});
const normalize = (value) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е');
const searchMatches = (query, withCode) => {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return [...PRICED, ...PENDING].filter((entry) => words.every((word) => normalize(
    `${entry.title} ${withCode ? entry.code : ''} ${entry.description} ${CATEGORY_TITLES[entry.category]} ${entry.agingMonths ?? ''}`,
  ).includes(word)));
};
const digits = (value) => String(value).replace(/\D/g, '');
const lastAmount = (text) => {
  const groups = text.match(/\d[\d\s  ]*₽/g);
  if (!groups) throw new Error(`Денежная сумма не найдена в «${text}»`);
  return digits(groups[groups.length - 1]);
};
// Суммы в вёрстке разделены неразрывными пробелами и могут соседствовать со ставкой «₽/100 г».
async function expectAmount(locator, value) {
  await expect.poll(async () => {
    const text = (await locator.textContent()) || '';
    return text.includes('₽') ? lastAmount(text) : '';
  }).toBe(String(value));
}

// Артикулы механик: кусок с ценой за кг, фасовка с фиксированной ценой, аксессуар за штуку.
const CUT = 'nf-00000213';
const PACK = 'nf-00000229';
const EXTRA = 'nf-00000182';
const PENDING_CAT = 'chocolate';
const MAX_SAME_PACK = 20;

async function screenshot(page, info, name) {
  await page.screenshot({ path: path.join(shots, `${name}-${info.project.name}.png`), fullPage: false });
}
async function noOverflow(page) {
  const size = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, width: document.documentElement.scrollWidth }));
  expect(size.width).toBeLessThanOrEqual(size.viewport + 1);
}
async function openCatalog(page, surface) {
  if (surface === 'next') await page.goto('/catalog');
  else await page.goto(`${staticURL}/#catalog`);
  await expect(page.locator('.dept-tabs')).toBeVisible();
}
async function pickDept(page, surface, cat) {
  if (surface === 'next') await page.locator('.dept-tabs button').filter({ hasText: CATEGORY_TITLES[cat] }).click();
  else await page.locator(`#dept-tabs [data-dept="dept-${cat}"]`).click();
  await expect(page.locator(`#dept-${cat}`)).toBeVisible();
}
const cardsOf = (page) => page.locator('.dept-section article[data-product-id],.dept-section article[data-preview-id]');
async function fillSearch(page, surface, query) {
  if (surface === 'next') await page.getByRole('searchbox', { name: 'Поиск по всей лавке' }).fill(query);
  else await page.locator('#catalog-search').fill(query);
}
async function createOrder(api, items, deliveryId = 'pickup') {
  const quoted = await api.post('/api/cart', { data: { items, deliveryId } });
  expect(quoted.status()).toBe(200);
  const { quote } = await quoted.json();
  const created = await api.post('/api/orders', { data: { items, customer: { name: 'Локальный тест', phone: '+79991234567' }, consent: true, messenger: 'SMS', deliveryId, deliveryAddress: deliveryId === 'pickup' ? '' : 'Тестовый адрес', expectedItemsSum: quote.itemsSum, expectedDeliveryCost: quote.delivery.cost } });
  expect(created.status()).toBe(201);
  return { ...await created.json(), quote };
}

test.afterAll(() => {
  if (originalHash !== null) expect(crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex')).toBe(originalHash);
});

test('обе витрины отдают прайс 0711 во всех отделах', async ({ page }, info) => {
  for (const surface of ['next', 'static']) {
    await openCatalog(page, surface);
    const tabs = surface === 'next' ? page.locator('.dept-tabs button') : page.locator('#dept-tabs [role="tab"]');
    expect(await tabs.count()).toBe(CATS.length);
    if (surface === 'next') await expect(page.locator('.catalog-stock')).toContainText(`С ценой: ${PRICED.length} · Уточняются: ${PENDING.length}`);
    else await expect(page.locator('#search-status')).toContainText(`${PRICED.length} с ценой · ${PENDING.length} уточняются`);
    for (const cat of CATS) {
      await pickDept(page, surface, cat);
      const expected = deptCount(cat);
      await expect(page.locator(`#dept-${cat} article[data-product-id]`)).toHaveCount(expected.priced);
      await expect(page.locator(`#dept-${cat} article[data-preview-id]`)).toHaveCount(expected.pending);
      const label = expected.priced && expected.pending ? `${expected.priced} с ценой · ${expected.pending} уточняются`
        : expected.priced ? `${expected.priced} с ценой` : `${expected.pending} уточняются`;
      if (surface === 'next') {
        expect(digits(await tabs.filter({ hasText: CATEGORY_TITLES[cat] }).locator('.dept-count').textContent())).toBe(String(expected.priced + expected.pending));
      } else {
        expect(await page.locator(`#dept-tabs [data-dept="dept-${cat}"] .dept-tab-count`).textContent()).toBe(label);
      }
      // Ни одна позиция без цены не показывает цену.
      if (expected.pending) {
        await expect(page.locator(`#dept-${cat} article[data-preview-id] .price-value`)).toHaveText(Array.from({ length: expected.pending }, () => '—'));
      }
      await noOverflow(page);
    }
    await screenshot(page, info, `catalog-${surface}`);
  }
});

test('обе витрины ищут по прайсу и честно сообщают о пустом результате', async ({ page }) => {
  for (const surface of ['next', 'static']) {
    await openCatalog(page, surface);
    await fillSearch(page, surface, 'Каламата');
    const expected = searchMatches('Каламата', surface === 'static');
    expect(expected.length).toBeGreaterThan(0);
    await expect(cardsOf(page)).toHaveCount(expected.length);
    for (const entry of expected) {
      await expect(page.locator(`.dept-section article[data-product-id="${entry.id}"],.dept-section article[data-preview-id="${entry.id}"]`)).toHaveCount(1);
    }
    await fillSearch(page, surface, 'хамон несуществующий');
    await expect(cardsOf(page)).toHaveCount(0);
    if (surface === 'next') {
      await expect(page.locator('.catalog-hint')).toContainText('найдено: 0');
      await expect(page.locator('.cart-empty-state')).toContainText('Не нашлось подходящих товаров');
      await page.getByRole('button', { name: 'Очистить поиск' }).click();
    } else {
      await expect(page.locator('#search-status')).toContainText('Попробуйте другое название');
      await page.locator('#clear-search-btn').click();
    }
    await pickDept(page, surface, 'piece');
    await expect(page.locator('#dept-piece article[data-product-id]')).toHaveCount(deptCount('piece').priced);
  }
});

test('отрез под заказ: 50–2 000 г и ставка из прайса на обеих витринах', async ({ page }) => {
  await page.goto(`/product/${CUT}`);
  await expect(page.locator('.option-static', { hasText: 'Отрез под заказ' })).toBeVisible();
  await expect(page.locator('.option-chip')).toHaveCount(0);
  await expectAmount(page.locator('.rate-per-100'), Math.round(rateOf(CUT) / 10));
  const weight = page.getByLabel('Желаемый вес отреза, г');
  for (const grams of [300, 500, 50, 2000]) {
    await weight.fill(String(grams));
    await expectAmount(page.locator('.price-value'), cutPrice(CUT, grams));
    await expect(page.getByRole('button', { name: /В корзину/ })).toBeEnabled();
  }
  for (const invalid of ['49', '2001', '300.5', '']) {
    await weight.fill(invalid);
    await expect(page.getByRole('button', { name: /В корзину/ })).toBeDisabled();
    await expect(page.locator('.price-value')).toHaveText('—');
  }
  await weight.fill('400');
  await page.getByRole('button', { name: /В корзину/ }).click();
  await page.goto('/cart');
  await expect(page.locator('.cart-item-row')).toHaveCount(1);
  await expectAmount(page.locator('.cart-item-price strong'), cutPrice(CUT, 400));
  await expect(page.locator('[data-cart-badge]')).toHaveText('1');

  await page.goto(`${staticURL}/#dept-piece`);
  const card = page.locator(`.product-card[data-product-id="${CUT}"]`);
  await expect(card.locator('.option-static', { hasText: 'Отрез под заказ' })).toBeVisible();
  await expect(card.locator('.option-chip')).toHaveCount(0);
  await card.locator(`#custom-weight-${CUT}`).fill('');
  await expect(card.locator('.price-value')).toHaveText('—');
  await expect(card.locator('.add-btn')).toBeDisabled();
  await card.locator(`#custom-weight-${CUT}`).fill('400');
  await expectAmount(card.locator('.price-value'), cutPrice(CUT, 400));
  await card.locator(`#custom-weight-${CUT}`).fill('2001');
  await expect(card.locator('.add-btn')).toBeDisabled();
  await card.locator(`#custom-weight-${CUT}`).fill('500');
  await expectAmount(card.locator('.price-value'), cutPrice(CUT, 500));
});

test('фасовка, ставка за 100 г и аксессуары за штуку', async ({ page }) => {
  const pack = packOf(PACK);
  await page.goto(`/product/${PACK}`);
  await expectAmount(page.locator('.price-value'), pack.price);
  await expectAmount(page.locator('.rate-per-100'), per100(PACK));
  const add = page.getByRole('button', { name: /В корзину/ });
  await add.click(); await add.click(); await add.click();
  await expect(page.locator('[data-cart-badge]')).toHaveText('3');
  await page.goto('/cart');
  const quantity = page.getByLabel('Количество', { exact: true });
  await expect(quantity).toHaveValue('3');
  await page.getByRole('button', { name: /Уменьшить количество/ }).click();
  await expect(quantity).toHaveValue('2');
  await expect(page.locator('[data-cart-badge]')).toHaveText('2');
  await expectAmount(page.locator('.cart-item-price strong'), pack.price * 2);

  const extra = packOf(EXTRA);
  await page.goto(`/product/${EXTRA}`);
  await expectAmount(page.locator('.price-value'), extra.price);
  await expect(page.locator('.rate-per-100')).toHaveCount(0);

  await page.goto(`${staticURL}/#dept-olives`);
  const staticCard = page.locator(`.product-card[data-product-id="${PACK}"]`);
  await expectAmount(staticCard.locator('.price-value'), pack.price);
  await expectAmount(staticCard.locator('.rate-per-100'), per100(PACK));
  await page.locator('#dept-tabs [data-dept="dept-extras"]').click();
  await expectAmount(page.locator(`.product-card[data-product-id="${EXTRA}"] .price-value`), extra.price);
  await expect(page.locator(`.product-card[data-product-id="${EXTRA}"] .rate-per-100`)).toHaveCount(0);
});

test('лимит 20 одинаковых упаковок и атомарное добавление набора', async ({ page }, info) => {
  expect(KITS.evening.items.some((item) => item.productId === PACK)).toBe(true);

  await page.goto(`/product/${PACK}`);
  await page.getByRole('button', { name: /В корзину/ }).click();
  await page.goto('/cart');
  await page.getByLabel('Количество', { exact: true }).fill(String(MAX_SAME_PACK));
  await expect(page.locator('[data-cart-badge]')).toHaveText(String(MAX_SAME_PACK));
  await page.goto('/#scenarios');
  const card = page.locator('.scenario-card').filter({ hasText: KITS.evening.title });
  await card.getByRole('button', { name: 'Добавить весь набор', exact: true }).click();
  await expect(card.getByRole('status')).toContainText('Набор не добавлен');
  await expect(page.locator('[data-cart-badge]')).toHaveText(String(MAX_SAME_PACK));
  await page.goto('/cart');
  await expect(page.locator('.cart-item-row')).toHaveCount(1);
  await expect(page.locator('.cart-item-note').filter({ hasText: 'До 20 одинаковых упаковок' })).toBeVisible();
  await screenshot(page, info, 'cart-limit');

  await page.goto(`${staticURL}/#dept-olives`);
  const addButton = page.locator(`[data-action="add-to-cart"][data-product-id="${PACK}"]`);
  for (let index = 0; index < MAX_SAME_PACK; index++) await addButton.click();
  await expect(page.locator('#header-cart-count')).toHaveText(String(MAX_SAME_PACK));
  await page.locator('.site-tabs [data-tab="scenarios"]').click();
  const staticCard = page.locator('.scenario-card[data-set-id="evening"]');
  await staticCard.locator('[data-action="add-set"]').click();
  await expect(staticCard.locator('.card-feedback')).toContainText(String(MAX_SAME_PACK));
  await expect(page.locator('#header-cart-count')).toHaveText(String(MAX_SAME_PACK));
  await page.locator('#header-cart-btn').click();
  await expect(page.locator('.cart-item-row')).toHaveCount(1);
  await expect(page.locator('.cart-quantity-note')).toHaveText('До 20 одинаковых упаковок');
  await expect(page.locator('[data-quantity-uid][data-delta="1"]')).toBeDisabled();
});

test('оформление проверяет поля и выполняет демо-оплату', async ({ page }, info) => {
  await page.goto(`/product/${PACK}`);
  await page.getByRole('button', { name: /В корзину/ }).click();
  await page.goto('/cart');
  const submit = page.getByRole('button', { name: 'Оформить демо-заказ', exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('#checkout-name')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Ваше имя', { exact: true }).fill('Локальный тест');
  await page.getByLabel('Телефон', { exact: true }).fill('+79991234567');
  await page.locator('#checkout-consent').check();
  await expectAmount(page.locator('.cart-total-sum'), packOf(PACK).price);
  await screenshot(page, info, 'cart');
  await submit.click();
  await expect(page).toHaveURL(/\/order\/NH-[A-F0-9]+\?token=[a-f0-9]{32}/);
  await expect(page.getByRole('heading', { name: /Заказ №/ })).toBeVisible();
  const payment = page.getByRole('button', { name: /демо-оплат|Оплатить.*демо/i });
  await expect(payment).toBeVisible();
  await payment.click();
  await expect(page.getByRole('heading', { name: 'Демо-оплата подтверждена', exact: true })).toBeVisible();
  await expect(page.locator('[data-cart-badge]')).toHaveText('0');
  await noOverflow(page);
});

test('админ подтверждает вес и согласованную доставку; чужой заказ закрыт', async ({ page, request, browser, baseURL }, info) => {
  const items = [{ productId: CUT, kind: 'custom', weightG: 300 }, { productId: PACK, kind: 'pack', qty: 1 }];
  const order = await createOrder(request, items, 'cdek');
  const guest = await requestFactory.newContext({ baseURL });
  expect((await guest.get(`/api/orders/${order.orderId}`)).status()).toBe(404);
  const privateContext = await browser.newContext({ baseURL });
  expect((await (await privateContext.newPage()).goto(`/order/${order.orderId}`)).status()).toBe(404);
  await privateContext.close();
  await guest.dispose();

  await page.goto('/admin');
  await page.getByLabel('Пароль администратора').fill('test-only-admin-passphrase');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const card = page.locator('.admin-order-card').filter({ hasText: order.orderId });
  await expect(card).toBeVisible();
  const confirmedWeight = 400;
  await card.getByLabel(/Фактический вес:/).fill(String(confirmedWeight));
  await card.getByLabel(/Согласованная стоимость доставки/).fill('200');
  await card.getByRole('button', { name: 'Подтвердить все веса и доставку', exact: true }).click();
  await expect(card).toContainText('Ожидает оплаты');

  const expectedTotal = cutPrice(CUT, confirmedWeight) + packOf(PACK).price + 200;
  const body = await (await request.get(`/api/orders/${order.orderId}?token=${order.accessToken}`)).json();
  expect(body.delivery.cost).toBe(200);
  expect(body.itemsSum).toBe(cutPrice(CUT, confirmedWeight) + packOf(PACK).price);
  expect(body.total).toBe(expectedTotal);
  const cutItem = body.items.find((item) => item.requiresWeightCheck);
  expect(cutItem.weightG).toBe(confirmedWeight);
  expect(cutItem.price).toBe(cutPrice(CUT, confirmedWeight));
  expect(cutItem.label).not.toContain('~');
  await page.goto(`/order/${order.orderId}?token=${order.accessToken}`);
  await expectAmount(page.locator('.cart-total-sum'), expectedTotal);
  await screenshot(page, info, 'admin');
  await noOverflow(page);
});

test('позиции прайса без цены отдаются как «уточнить в лавке»', async ({ page }, info) => {
  for (const surface of ['next', 'static']) {
    await openCatalog(page, surface);
    await pickDept(page, surface, PENDING_CAT);
    const expected = deptCount(PENDING_CAT).pending;
    const previews = page.locator(`#dept-${PENDING_CAT} article[data-preview-id]`);
    await expect(previews).toHaveCount(expected);
    await expect(previews.locator('button')).toHaveCount(0);
    await expect(previews.locator('.price-value')).toHaveText(Array.from({ length: expected }, () => '—'));
    await expect(previews.locator('a[href="tel:+79068960099"]')).toHaveCount(expected);
    for (const image of await previews.locator('img').all()) {
      await image.scrollIntoViewIfNeeded();
      expect(await image.evaluate((element) => element.clientWidth)).toBeGreaterThan(0);
    }
    const active = page.locator('.dept-tabs [aria-pressed="true"],.dept-tabs [aria-selected="true"]');
    await expect(active).toHaveCount(1);
    expect(await active.evaluate((element) => getComputedStyle(element).fontWeight)).toBe('700');
    const barBounds = await page.locator('.dept-tabs').boundingBox();
    const buttonBounds = await active.boundingBox();
    expect(buttonBounds.x).toBeGreaterThanOrEqual(barBounds.x - 1);
    expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(barBounds.x + barBounds.width + 1);
    await noOverflow(page);
    await screenshot(page, info, `previews-${surface}`);
  }
});

test('весы обеих витрин считают одну и ту же ставку из прайса', async ({ page }) => {
  await page.goto('/#weight-system');
  await page.getByLabel('Что взвешиваем').selectOption(CUT);
  const nextWeight = page.getByLabel('Желаемый вес, г');
  for (const grams of [100, 300, 500]) {
    await nextWeight.fill(String(grams));
    await expectAmount(page.locator('.readout-digits').nth(2), cutPrice(CUT, grams));
  }
  await expectAmount(page.locator('.readout-digits').nth(1), rateOf(CUT));
  await nextWeight.fill('2001');
  await expect(page.locator('.scale-add-btn')).toBeDisabled();

  await page.goto(`${staticURL}/#weight-system`);
  await page.selectOption('#demo-scale-product', CUT);
  let lastGrams = 0;
  for (const grams of [100, 300, 500]) {
    await page.locator(`#demo-scale-chips [data-demo-weight="${grams}"]`).click();
    await expectAmount(page.locator('#demo-scale-price'), cutPrice(CUT, grams));
    lastGrams = grams;
  }
  await expectAmount(page.locator('#demo-scale-rate'), rateOf(CUT));
  await expect.poll(async () => digits(await page.locator('#demo-scale-weight').textContent() || '')).toBe(String(lastGrams));
});

test('табы, фото лавки, типографика и адаптив', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Geologica');
  expect(await page.evaluate(() => [...document.fonts].some((face) => face.family.includes('Geologica') && !face.family.includes('Fallback') && face.status === 'loaded'))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cured-ruby').trim().toLowerCase())).toBe('#5b2824');
  await noOverflow(page);
  await screenshot(page, info, 'home');
  const tabs = page.locator('.site-tabs [role="tab"]');
  expect(await tabs.count()).toBe(7);
  for (let index = 0; index < 7; index++) {
    await tabs.nth(index).click();
    await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role="tabpanel"]:visible')).toHaveCount(1);
    await noOverflow(page);
  }
  await page.getByRole('tab', { name: 'Наша лавка', exact: true }).click();
  const photo = page.getByAltText(/Интерьер лавки/);
  await expect(photo).toBeVisible();
  await expect(photo).toHaveJSProperty('naturalWidth', 720);
  await screenshot(page, info, 'shop');
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('нас');
  await noOverflow(page);
});

test('обе витрины заявляют эксклюзивное дистрибьюторство «Дома Хамона»', async ({ page }, info) => {
  const CLAIM = ['«Наш Хамон»', 'эксклюзивный дистрибьютор', '«Дом Хамона»', 'Коломна', 'Санкт-Петербургу', 'Ленинградской области'];
  const CANONICAL_CLAIM = '«Наш Хамон» — эксклюзивный дистрибьютор бренда «Дом Хамона» (Коломна) по Санкт-Петербургу и Ленинградской области';
  for (const surface of ['next', 'static']) {
    await page.goto(surface === 'next' ? '/' : `${staticURL}/`);
    const bar = page.locator('.distributor-bar');
    await expect(bar).toBeVisible();
    const barText = normalize((await bar.textContent()) || '');
    // Озвучка скринридера склеивает соседние элементы без пробела — фраза должна читаться целиком.
    expect(barText.replace(/\s+/g, ' ').trim()).toBe(normalize(CANONICAL_CLAIM));
    for (const fact of CLAIM) expect(barText).toContain(normalize(fact));
    // Полоса не липкая: шапка остаётся sticky на top:0, якоря и --header-h не съезжают.
    expect(await bar.evaluate((element) => getComputedStyle(element).position)).toBe('static');
    // Текст полосы не должен липнуть к краю экрана: контейнер сохраняет горизонтальные отступы.
    expect(await bar.locator('.container').evaluate((element) => {
      const style = getComputedStyle(element);
      return parseFloat(style.paddingLeft) >= 12 && parseFloat(style.paddingRight) >= 12;
    })).toBe(true);
    expect(await page.locator('.site-header').evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
    await page.evaluate(() => window.scrollTo(0, 400));
    expect(Math.round(await page.locator('.site-header').evaluate((element) => element.getBoundingClientRect().top))).toBe(0);
    // Контраст текста полосы считаем из фактически применённых цветов, а не из ожиданий.
    const contrast = await page.evaluate(() => {
      const channel = (value) => {
        const [r, g, b] = value.match(/\d+/g).map(Number);
        return [r, g, b].map((c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
      };
      const luminance = (value) => { const [r, g, b] = channel(value); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const bar = document.querySelector('.distributor-bar');
      const strong = getComputedStyle(bar.querySelector('strong')).color;
      const muted = getComputedStyle(bar.querySelector('span')).color;
      const background = getComputedStyle(bar).backgroundColor;
      const ratio = (color) => {
        const [a, b] = [luminance(color), luminance(background)].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
      };
      return { strong: ratio(strong), muted: ratio(muted) };
    });
    expect(contrast.strong).toBeGreaterThanOrEqual(4.5);
    expect(contrast.muted).toBeGreaterThanOrEqual(4.5);
    const supplier = page.locator('.footer-supplier');
    await supplier.scrollIntoViewIfNeeded();
    const supplierText = normalize((await supplier.textContent()) || '');
    for (const fact of CLAIM.slice(1)) expect(supplierText).toContain(normalize(fact));
    expect(supplierText).toContain(normalize('И ближе, и роднее. Сделано в Коломне.'));
    // Реквизиты поставщика из брендбука не должны притворяться контактами лавки.
    expect(supplierText).not.toContain('101-30-30');
    expect(supplierText).not.toContain('domhamona');
    await noOverflow(page);
    await screenshot(page, info, `distributor-${surface}`);
  }
  await page.goto('/catalog');
  await expect(page.locator('.distributor-bar')).toBeVisible();
});

test('обе витрины грузятся без своих 404, ошибок скриптов и битых картинок', async ({ page, baseURL }) => {
  for (const surface of ['next', 'static']) {
    const origin = surface === 'next' ? new URL(baseURL).origin : new URL(staticURL).origin;
    const errors = [];
    const onConsole = (message) => {
      if (message.type() !== 'error') return;
      // favicon и прочие ресурсы браузер грузит мимо сетевых событий страницы — их видно только здесь.
      if (message.text().startsWith('Failed to load resource')) {
        const url = message.location()?.url || '';
        if (url.startsWith(origin)) errors.push(`resource: ${url}`);
        return;
      }
      errors.push(`console: ${message.text()}`);
    };
    const onPageError = (error) => errors.push(`pageerror: ${error}`);
    const onResponse = (response) => { if (response.status() >= 400 && response.url().startsWith(origin)) errors.push(`http ${response.status()} ${response.url()}`); };
    const onFailed = (request) => {
      if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
      if (request.url().startsWith(origin)) errors.push(`reqfail: ${request.url()}`);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    page.on('requestfailed', onFailed);
    await page.goto(surface === 'next' ? '/' : `${staticURL}/`);
    await page.waitForLoadState('load');
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.footer-supplier').scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    const broken = await page.evaluate(() => [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc));
    expect(broken).toEqual([]);
    expect(errors).toEqual([]);
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
    page.off('requestfailed', onFailed);
  }
});

test('статическая витрина: разделы, фото лавки и демо-оформление', async ({ page }, info) => {
  await page.goto(`${staticURL}/#catalog`);
  const tabs = page.locator('.site-tabs [role="tab"]');
  await expect(tabs).toHaveCount(8);
  for (let index = 0; index < 8; index++) {
    await tabs.nth(index).click();
    await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.site-panel:visible')).toHaveCount(1);
    await noOverflow(page);
  }
  await page.getByRole('tab', { name: 'Наша лавка', exact: true }).click();
  await expect(page.locator('img[src="brand/shop-interior.webp"]')).toHaveJSProperty('naturalWidth', 720);
  await screenshot(page, info, 'static-shop');

  await page.goto(`${staticURL}/#dept-olives`);
  await page.locator(`[data-action="add-to-cart"][data-product-id="${PACK}"]`).click();
  await page.locator('#header-cart-btn').click();
  await expect(page.locator('#cart-sheet')).toHaveClass(/is-open/);
  await expect(page.locator('#header-cart-count')).toHaveText('1');
  await page.locator('[data-deliv-id="pickup"]').click();
  await page.locator('#submit-order-btn').click();
  await expect(page.locator('#form-feedback')).toContainText(/демонстрац|демо/i);
  await page.locator('#customer-name').fill('Локальный тест');
  await page.locator('#customer-phone').fill('+79991234567');
  await page.locator('#submit-order-btn').click();
  await expect(page.locator('#form-feedback')).toContainText('Это не заказ');
  expect(lastAmount(await page.locator('#form-feedback').textContent())).toBe(String(packOf(PACK).price));
  await expect(page.locator('#header-cart-count')).toHaveText('0');
  await noOverflow(page);
});

test('истории обеих витрин ведут на рабочие разделы и добавляют товар прайса', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть историю: Честный вес', exact: true }).click();
  await page.getByRole('button', { name: 'Посчитать на весах', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Как считаем вес', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.scale-readout')).toBeVisible();
  await page.getByRole('tab', { name: 'Каталог', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть историю: Выдержка', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть гид по выдержке', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Выдержка', exact: true })).toHaveAttribute('aria-selected', 'true');

  await page.goto(`${staticURL}/#catalog`);
  await page.locator('[data-story-idx="0"]').click();
  await expect(page.locator('#stories-player')).toHaveClass(/is-open/);
  expect(lastAmount(await page.locator('#story-action-btn').textContent())).toBe(String(cutPrice(CUT, 300)));
  await page.locator('#story-action-btn').click();
  await expect(page.locator('#header-cart-count')).toHaveText('1');
  await expect(page.locator('.cart-item-title').first()).toHaveText(ENTRIES.get(CUT).title);
});

test('фото подборок сохраняют разметку владельца без вымышленных цен', async ({ page }, info) => {
  for (const [label, url] of [['next', '/#scenarios'], ['static', `${staticURL}/#scenarios`]]) {
    await page.goto(url);
    for (const panel of ['scenarios', 'buyer-choices']) {
      const tab = page.locator('.site-tabs [role="tab"]').filter({ hasText: panel === 'scenarios' ? 'К столу и в подарок' : 'Выбор покупателей' });
      await tab.click();
      const gallery = page.locator(`#${panel} .photo-choice-gallery`);
      await expect(gallery.locator('.photo-choice-group')).toHaveCount(3);
      const mapping = { self: ['choice-self.webp'], table: ['choice-table-1.webp', 'choice-table-2.webp'], gift: ['choice-gift.webp'] };
      for (const [category, files] of Object.entries(mapping)) {
        const group = gallery.locator(`[data-choice-category="${category}"]`);
        await expect(group.locator('img')).toHaveCount(files.length);
        for (let index = 0; index < files.length; index++) {
          const image = group.locator('img').nth(index);
          await expect(image).toHaveAttribute('src', new RegExp(files[index]));
          await image.scrollIntoViewIfNeeded();
          await expect(image).toHaveJSProperty('naturalWidth', 720);
        }
      }
      await expect(gallery.locator('.scenario-total,.price-value')).toHaveCount(0);
      await noOverflow(page);
      await screenshot(page, info, `photos-${label}-${panel}`);
    }
  }
});

test('наборы прайса считаются по реальным фасовкам и добавляются целиком', async ({ page }) => {
  await page.goto('/#scenarios');
  for (const kit of catalog.kits) {
    await expectAmount(page.locator('.scenario-card').filter({ hasText: kit.title }).locator('.scenario-total'), kitPrice(kit.id));
  }
  await page.locator('.scenario-card').filter({ hasText: KITS.self.title }).getByRole('button', { name: 'Добавить весь набор' }).click();
  await expect(page.locator('[data-cart-badge]')).toHaveText(String(KITS.self.items.length));
  await page.goto('/cart');
  await expect(page.locator('.cart-item-row')).toHaveCount(KITS.self.items.length);
  await expectAmount(page.locator('.cart-total-sum'), kitPrice('self'));

  await page.goto(`${staticURL}/#scenarios`);
  for (const kit of catalog.kits) {
    await expectAmount(page.locator('.scenario-card').filter({ hasText: kit.title }).locator('.scenario-total'), kitPrice(kit.id));
  }
  await page.locator('.scenario-card[data-set-id="self"] [data-action="add-set"]').click();
  await expect(page.locator('#header-cart-count')).toHaveText(String(KITS.self.items.length));
});

test('фильтр выдержки на обеих витринах оставляет только подходящие позиции', async ({ page }) => {
  const agedPiece = PRICED.filter((product) => product.category === 'piece' && product.agingMonths >= 20 && product.agingMonths <= 22);
  expect(agedPiece.length).toBeGreaterThan(0);
  await page.goto('/catalog?category=piece&aging=20-22');
  await expect(page.locator('#dept-piece article[data-product-id]')).toHaveCount(agedPiece.length);
  for (const product of agedPiece) await expect(page.locator(`#dept-piece [data-product-id="${product.id}"]`)).toHaveCount(1);
  await page.goto('/catalog?category=sliced&aging=20-22');
  const agedSliced = PRICED.filter((product) => product.category === 'sliced' && product.agingMonths >= 20 && product.agingMonths <= 22);
  expect(await page.locator('#dept-sliced article[data-product-id]').count()).toBe(agedSliced.length);

  await page.goto(`${staticURL}/#dept-piece`);
  await page.locator('[data-filter-aging="20-22"]').click();
  await expect(page.locator('#dept-piece article[data-product-id]')).toHaveCount(agedPiece.length);
  await page.locator('[data-filter-aging="24"]').click();
  const aged24 = PRICED.filter((product) => product.category === 'piece' && product.agingMonths >= 24);
  await expect(page.locator('#dept-piece article[data-product-id]')).toHaveCount(aged24.length);
});

test('клавиатура, фокус drawer и доступность', async ({ page }, info) => {
  await page.goto('/');
  const catalog = page.getByRole('tab', { name: 'Каталог', exact: true });
  await catalog.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'К столу и в подарок', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(catalog).toBeFocused();
  if (info.project.name !== 'desktop') {
    const menu = page.getByRole('button', { name: 'Открыть меню', exact: true });
    await menu.click();
    const dialog = page.getByRole('dialog', { name: 'Меню лавки', exact: true });
    await expect(dialog).toBeVisible();
    for (let index = 0; index < 14; index++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.getElementById('menu-drawer').contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
  }
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const violations = result.violations.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length }));
  fs.writeFileSync(path.join(root, `test-results/a11y-${info.project.name}.json`), JSON.stringify(result, null, 2));
  expect(violations).toEqual([]);
});

test('полировка обеих витрин — selection, tap, скроллбар, мета, hover и press-отклик', async ({ page }) => {
  for (const surface of ['next', 'static']) {
    await page.goto(surface === 'next' ? '/' : `${staticURL}/`);
    await page.waitForLoadState('load');
    const base = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement);
      const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.content || '';
      return {
        selection: getComputedStyle(document.body, '::selection').backgroundColor,
        tap: html.webkitTapHighlightColor,
        gutter: html.scrollbarGutter,
        theme: meta('theme-color'),
        ogImage: meta('og:image'),
        canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      };
    });
    expect(base.selection).toBe('rgb(91, 40, 36)');
    expect(base.tap).toBe('rgba(91, 40, 36, 0.16)');
    expect(base.gutter).toBe('stable');
    expect(base.theme).toBe('#5B2824');
    expect(base.ogImage).toContain('shop-interior.webp');
    expect(base.canonical).not.toBe('');
    const card = page.locator('.product-card').first();
    await card.scrollIntoViewIfNeeded();
    const styleOf = (el) => el.evaluate((e) => { const s = getComputedStyle(e); return [s.backgroundColor, s.borderColor, s.boxShadow, s.transform].join('|'); });
    const before = await styleOf(card);
    await card.hover();
    await expect.poll(() => styleOf(card), { timeout: 3000 }).not.toBe(before);
    const button = page.locator('.add-btn').first();
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => button.evaluate((e) => getComputedStyle(e).transform), { timeout: 3000 }).toContain('0.97');
    await page.mouse.up();
    // Тач-цели: эффективная зона не меньше 24×24 (WCAG 2.2 AA); radio считаем по обёртке-label.
    const tooSmall = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('a[href], button, input, select, [role="tab"], [role="radio"]')) {
        const s = getComputedStyle(el);
        const b0 = el.getBoundingClientRect();
        if (!b0.width || !b0.height || s.visibility === 'hidden' || s.display === 'none') continue;
        const target = (el.matches('input[type="radio"], input[type="checkbox"]') && el.closest('label')) || el;
        const b = target.getBoundingClientRect();
        if (b.width < 24 || b.height < 24) out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 30)} ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
      return out;
    });
    expect(tooSmall).toEqual([]);
    if (surface === 'static') {
      const ratios = await page.evaluate(() => [...document.querySelectorAll('img[src*="logo-"]')].map((i) => ({
        src: i.getAttribute('src'), w: Number(i.getAttribute('width')), h: Number(i.getAttribute('height')),
      })));
      expect(ratios.length).toBeGreaterThan(2);
      for (const r of ratios) {
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        const intrinsic = r.src.includes('horizontal') ? 342.599 / 85.125 : 214.996 / 174.495;
        expect(Math.abs(r.w / r.h - intrinsic) / intrinsic).toBeLessThan(0.02);
      }
    }
    await noOverflow(page);
  }
});

test('статичная витрина живёт без CDN — шрифты и gsap недоступны, корзина работает', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('request', (request) => { if (!request.url().startsWith(staticURL)) external.push(request.url()); });
  await page.route('**cdnjs.cloudflare.com/**', (route) => route.abort());
  await page.route('**fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**fonts.gstatic.com/**', (route) => route.abort());
  await page.goto(`${staticURL}/#dept-olives`);
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => {
    const width = (family, weight) => {
      const span = document.createElement('span');
      span.textContent = 'Хамон в Коломне';
      span.style.cssText = `position:absolute;left:-9999px;font-size:64px;font-weight:${weight};font-family:${family}`;
      document.body.appendChild(span);
      const w = span.getBoundingClientRect().width;
      span.remove();
      return w;
    };
    return {
      geologicaRu: document.fonts.check('600 16px Geologica', 'Хамон соль время'),
      playfairRu: document.fonts.check('700 32px "Playfair Display"', 'Хамон'),
      geologicaAxis: width("'Geologica'", 400) !== width("'Geologica'", 600),
      playfairAxis: width("'Playfair Display'", 700) !== width("'Playfair Display'", 800),
      gsap: typeof window.gsap === 'object' || typeof window.gsap === 'function',
    };
  });
  expect(external).toEqual([]);
  expect(fonts.geologicaRu).toBe(true);
  expect(fonts.playfairRu).toBe(true);
  expect(fonts.geologicaAxis).toBe(true);
  expect(fonts.playfairAxis).toBe(true);
  expect(fonts.gsap).toBe(true);
  await page.locator(`[data-action="add-to-cart"][data-product-id="${PACK}"]`).click();
  await expect(page.locator('#header-cart-count')).toHaveText('1');
  await page.locator('#header-cart-btn').click();
  await expect(page.locator('.cart-item-row')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('фото не растягиваются выше исходного разрешения ни на одной витрине', async ({ page }) => {
  const measure = async () => {
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => { document.querySelectorAll('img[loading="lazy"]').forEach((image) => { image.loading = 'eager'; }); });
    await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode().catch(() => {}))));
    return page.evaluate(() => [...document.images]
      .filter((image) => image.getBoundingClientRect().width > 0 && !image.currentSrc.endsWith('.svg') && image.naturalWidth > 0)
      .map((image) => ({ src: image.currentSrc.split('/').pop(), rendered: Math.round(image.getBoundingClientRect().width), natural: image.naturalWidth })));
  };
  for (const surface of ['next', 'static']) {
    for (const cat of CATS) {
      await page.goto(surface === 'next' ? `/catalog#dept-${cat}` : `${staticURL}/#dept-${cat}`);
      await expect(page.locator(`#dept-${cat}`)).toBeVisible();
      for (const row of await measure()) {
        expect(row.rendered, `${surface} ${cat} ${row.src}`).toBeLessThanOrEqual(row.natural + 1);
      }
    }
    await page.goto(surface === 'next' ? '/#shop' : `${staticURL}/#shop`);
    const supplier = await measure();
    const strip = supplier.filter((row) => row.src.startsWith('supplier-'));
    expect(strip.length).toBe(2);
    for (const row of strip) {
      expect(row.natural).toBeGreaterThanOrEqual(700);
      // Крупные кадры поставщика точны и на retina: два device-пикселя на исходный.
      expect(row.rendered * 2).toBeLessThanOrEqual(row.natural + 2);
    }
    // Первый экран обеих витрин ведёт реальное макрофото нарезки, а не вектор.
    await page.goto(surface === 'next' ? '/' : `${staticURL}/`);
    const hero = (await measure()).find((row) => row.src === 'hero-slicing.webp');
    expect(hero, `${surface} hero photo`).toBeTruthy();
    expect(hero.natural).toBeGreaterThanOrEqual(1200);
    expect(hero.rendered).toBeLessThanOrEqual(hero.natural + 1);
  }
  await page.goto('/product/nf-00000187');
  const detail = await measure();
  const tiny = detail.find((row) => row.src === 'nf-00000187.webp');
  expect(tiny).toBeTruthy();
  expect(tiny.rendered).toBeLessThanOrEqual(tiny.natural + 1);
});

test('активный таб или фильтр всегда визуально отличается от неактивного', async ({ page }) => {
  // На бумажной витрине выдержка — чипы, в движке это селект: списки групп различаются намеренно.
  const groupsFor = (surface) => ['.site-tabs button', '.dept-tabs button', '.magnet-btn', ...(surface === 'static' ? ['.filter-btn'] : [])];
  // В одной группе состояние живёт в aria-атрибуте, а в другой — во вложенном радио: сравниваем
  // активный элемент с неактивным соседом из того же переключателя, а не со всем сайтом.
  const probe = (page2, selectors) => page2.evaluate((list) => list.flatMap((sel) => {
    const state = (el) => {
      const aria = ['aria-selected', 'aria-pressed', 'aria-checked'].map((a) => el.getAttribute(a)).find((v) => v === 'true' || v === 'false');
      if (aria) return aria === 'true';
      const input = el.querySelector('input[type="radio"], input[type="checkbox"]');
      return input ? input.checked : null;
    };
    const read = (el) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.color, s.borderTopColor, s.borderBottomWidth, s.fontWeight].join('|');
    };
    return [...document.querySelectorAll(sel)]
      .filter((el) => state(el) === true)
      .map((el) => {
        const siblings = [...(el.parentElement || el).querySelectorAll(sel)];
        const inactive = siblings.find((x) => state(x) === false);
        return { sel, comparable: Boolean(inactive), same: inactive ? read(el) === read(inactive) : null, text: (el.textContent || '').slice(0, 24) };
      });
  }), selectors);
  for (const surface of ['next', 'static']) {
    const results = [];
    const lone = [];
    for (const route of [surface === 'next' ? '/' : `${staticURL}/`, ...(CATS.map((cat) => surface === 'next' ? `/catalog#dept-${cat}` : `${staticURL}/#dept-${cat}`))]) {
      await page.goto(route);
      if (route.includes('dept-')) await expect(page.locator(`#dept-${route.split('dept-')[1]}`)).toBeVisible();
      // Весовые чипы становятся нажатыми только после выбора, поэтому сначала выбираем порцию.
      await page.evaluate(() => { const chip = document.querySelector('.magnet-btn'); if (chip) chip.click(); });
      // Чипы формата появляются, только когда у позиции два и более варианта.
      results.push(...await probe(page, [...groupsFor(surface), '.option-chip']));
      lone.push(...await page.evaluate(() => [...document.querySelectorAll('[role="radiogroup"], fieldset.product-options')]
        .map((group) => ({ group, n: group.querySelectorAll('[role="radio"], input[type="radio"]').length }))
        .filter(({ group, n }) => n === 1)
        .map(({ group }) => (group.getAttribute('aria-label') || group.className) + ' · один вариант как выбор')));
    }
    // Группа из одного варианта — это не выбор: единственный формат обязан быть текстом.
    expect(lone, `${surface}: псевдовыбор формата`).toEqual([]);
    const comparable = results.filter((r) => r.comparable);
    const broken = comparable.filter((r) => r.same);
    expect(broken.map((r) => `${surface} ${r.sel} «${r.text}» выглядит как сосед`)).toEqual([]);
    expect([...new Set(comparable.map((r) => r.sel))]).toEqual(expect.arrayContaining(groupsFor(surface)));
  }
});

test('в CSS обеих витрин нет мёртвых классов и якорей на несуществующие id', () => {
  const ruleSelectors = (css) => css.split(/\r?\n/).flatMap((raw) => {
    const media = /^@media [^{]+\{\s*(.+?)\s*\}\s*$/.exec(raw);
    const body = media ? media[1] : raw;
    const open = body.indexOf('{');
    if (open < 0 || (body.match(/\{/g) || []).length !== 1 || (body.match(/\}/g) || []).length !== 1) return [];
    const head = body.slice(0, open);
    if (/^\s*(\/\*|@|\})/.test(head)) return [];
    return head.split(',').map((s) => s.trim()).filter(Boolean);
  });
  const mentions = (token, text) => new RegExp(`[^\\w-]${token}(?:[^\\w-]|$)`).test(text);
  const audit = (label, cssText, markupText) => {
    const selectors = ruleSelectors(cssText);
    const deadClass = selectors.filter((s) => [...s.matchAll(/\.([A-Za-z][\w-]*)/g)].some((m) => !mentions(m[1], markupText)));
    const deadId = selectors.filter((s) => [...s.matchAll(/#([A-Za-z][\w-]*)/g)].some((m) => !new RegExp(`id=[\"']${m[1]}[\"']`).test(markupText)));
    expect(deadClass.length + deadId.length, `${label}: selectors=${selectors.length} deadClass=[${deadClass}] deadId=[${deadId}]`).toBe(0);
    return selectors.length;
  };
  const html = fs.readFileSync(path.resolve(root, '../index.html'), 'utf8');
  const htmlCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const htmlMarkup = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
  const nextCss = fs.readFileSync(path.resolve(root, 'app/globals.css'), 'utf8');
  const nextMarkup = ['app', 'components'].flatMap((dir) => fs.readdirSync(path.resolve(root, dir), { recursive: true })
    .filter((f) => /\.(tsx|ts)$/.test(String(f)))
    .map((f) => fs.readFileSync(path.resolve(root, dir, String(f)), 'utf8')));
  expect(audit('бумажная витрина', htmlCss, htmlMarkup) > 300).toBe(true);
  expect(audit('движок', nextCss, nextMarkup.join('\n')) > 300).toBe(true);
});

test('надзаголовки без капс-разрядки, а счётчик каталога честный ещё до JS', async ({ page }) => {
  const html = fs.readFileSync(path.resolve(root, '../index.html'), 'utf8');
  const cssOf = (text) => [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const capsStamp = (label, css) => css.split(/\r?\n/)
    .filter((line) => /text-transform:\s*uppercase/.test(line)
      && parseFloat((/letter-spacing:\s*([\d.]+)/.exec(line) || [])[1] || '0') >= 0.1)
    .map((line) => `${label}: ${line.trim()}`);
  const stamped = [
    ...capsStamp('бумажная витрина', cssOf(html)),
    ...capsStamp('движок', fs.readFileSync(path.resolve(root, 'app/globals.css'), 'utf8')),
  ];
  expect(stamped, `капс-разрядка ≥ 0.1em: [${stamped}]`).toEqual([]);

  const label = `${catalog.products.length} с ценой · ${(catalog.previews || []).length} уточняются`;
  const initial = /id="catalog-count"[^>]*>([^<]*)</.exec(html)[1].trim();
  expect(initial, 'подложка счётчика до запуска JS').toBe(label);
  await page.goto(`${staticURL}/index.html`);
  await expect(page.locator('#catalog-count')).toHaveText(label);
});

test('удаление позиции корзины можно отменить на обеих витринах', async ({ page }) => {

  await page.goto(`/product/${PACK}`);
  await page.getByRole('button', { name: /В корзину/ }).click();
  await page.goto('/cart');
  await page.locator('.cart-remove-btn').first().click();
  await expect(page.locator('.cart-item-row')).toHaveCount(0);
  const undo = page.getByRole('button', { name: 'Вернуть', exact: true });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(page.locator('.cart-item-row')).toHaveCount(1);
  await expect(page.locator('[data-cart-badge]')).toHaveText('1');
  await expect(undo).toHaveCount(0);

  await page.goto(`${staticURL}/#dept-olives`);
  await page.locator(`[data-action="add-to-cart"][data-product-id="${PACK}"]`).click();
  await page.locator('#header-cart-btn').click();
  await page.locator('.cart-remove-btn').first().click();
  await expect(page.locator('.cart-item-row')).toHaveCount(0);
  await expect(page.locator('#cart-undo')).toBeVisible();
  await page.locator('#cart-undo-btn').click();
  await expect(page.locator('.cart-item-row')).toHaveCount(1);
  await expect(page.locator('#header-cart-count')).toHaveText('1');
  await expect(page.locator('#cart-undo')).toBeHidden();
});
