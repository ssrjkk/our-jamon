const { test, expect } = require('@playwright/test');

// Ожиданий, придуманных для теста, здесь нет: имена служб доставки берутся из
// отрендеренной Next-витрины, которой принадлежит lib/delivery.ts — единственного слоя,
// чьё name попадает в заказ и в админку. Статика на Pages строит тот же текст из двух
// мест (разметка кнопок и DELIVERY_NAMES), и до этого гейта их расхождение видели только
// глаза: в корзине было «Самовывоз СПб», а в заказе — «Самовывоз».
const catalog = require('../../lib/catalog.json');
const staticURL = process.env.E2E_STATIC_URL || 'http://127.0.0.1:8765';

// Механика: фасовка с граммами, чтобы добавить в корзину без ввода веса.
const PACK = (() => {
  const product = catalog.products.find((entry) => entry.kind === 'pack' && (entry.packs || []).some((pack) => pack.weightG > 0));
  if (!product) throw new Error('в прайсе не осталось фасовки с граммами — гейту нечем наполнять корзину');
  return product;
})();

// Порядок лексический: витрины перечисляют службы по-своему (Next — от самовывоза,
// Pages — от СДЭКА), а совпадать должны имена и набор идентов, а не порядок строк.
const DELIVERY_IDS = ['cdek', 'drivee', 'pickup', 'yandex'];

async function fillNextCheckout(page) {
  await page.locator('#checkout-name').fill('Локальный тест');
  await page.locator('#checkout-phone').fill('+79991234567');
  await page.locator('#checkout-consent').check();
}

async function fillStaticCheckout(page) {
  await page.locator('#customer-name').fill('Локальный тест');
  await page.locator('#customer-phone').fill('+79991234567');
}

test('доставка: обе витрины показывают четыре службы с одними именами', async ({ page }) => {
  await page.goto(`/product/${PACK.id}`);
  await page.getByRole('button', { name: /В корзину/ }).click();
  await page.goto('/cart');
  // Ждём, пока корзина реально отрендерит оформление: без этого снимок `.all()` на
  // планшете успевал пройти по пустой корзине и гейт падал не на вёрстке, а на себе.
  await expect(page.locator('.cart-item-row')).toHaveCount(1);
  await expect(page.locator('.delivery-radio-grid label')).toHaveCount(4);
  const nextOptions = new Map();
  for (const option of await page.locator('.delivery-radio-grid label').all()) {
    nextOptions.set(await option.locator('input').inputValue(), (await option.locator('strong').innerText()).trim());
  }
  expect([...nextOptions.keys()].sort()).toEqual(DELIVERY_IDS);
  expect(await page.getByRole('radio').count()).toBe(4);
  expect(new Set(nextOptions.values()).size).toBe(4);

  await page.goto(`${staticURL}/#dept-${PACK.category}`);
  const card = page.locator(`.product-card[data-product-id="${PACK.id}"]`);
  await card.locator('.add-btn').click();
  await page.locator('#header-cart-btn').click();
  await expect(page.locator('.cart-items-list .cart-item-row')).toHaveCount(1);
  await expect(page.locator('.delivery-radio-grid button[data-deliv-id]')).toHaveCount(4);
  const staticOptions = new Map();
  for (const option of await page.locator('.delivery-radio-grid button[data-deliv-id]').all()) {
    staticOptions.set(await option.getAttribute('data-deliv-id'), (await option.locator('strong').innerText()).trim());
  }
  expect([...staticOptions.keys()].sort()).toEqual(DELIVERY_IDS);
  expect(Object.fromEntries(staticOptions)).toEqual(Object.fromEntries(nextOptions));
});

test('доставка: выбранная служба отмечает только себя и не выдумывает цену', async ({ page }) => {
  await page.goto(`/product/${PACK.id}`);
  await page.getByRole('button', { name: /В корзину/ }).click();
  await page.goto('/cart');
  const summary = page.locator('.checkout-summary div', { has: page.locator('span', { hasText: /^Доставка$/ }) }).locator('strong');
  for (const id of DELIVERY_IDS) {
    const option = page.locator(`.delivery-radio-grid label:has(input[value="${id}"])`);
    await option.locator('input').click();
    await expect(option.locator('input')).toBeChecked();
    expect(await page.locator('.delivery-radio-grid label input:checked').count()).toBe(1);
    const digits = (await summary.innerText()).replace(/\D/g, '');
    if (id === 'pickup') expect(digits).toBe('0');
    else expect(digits).toBe('');
  }

  await page.goto(`${staticURL}/#dept-${PACK.category}`);
  const card = page.locator(`.product-card[data-product-id="${PACK.id}"]`);
  await card.locator('.add-btn').click();
  await page.locator('#header-cart-btn').click();
  for (const id of DELIVERY_IDS) {
    const button = page.locator(`.delivery-option-btn[data-deliv-id="${id}"]`);
    await button.click();
    await expect(button).toHaveAttribute('aria-checked', 'true');
    expect(await page.locator('.delivery-option-btn[aria-checked="true"]').count()).toBe(1);
    const own = (await button.locator('.deliv-cost').innerText()).replace(/\D/g, '');
    const foot = (await page.locator('#delivery-total-note').innerText()).replace(/\D/g, '');
    if (id === 'pickup') expect(own).toBe('0');
    else expect(own).toBe('');
    expect(foot).toBe('');
  }
});

test('доставка: имя с кнопки доходит до заказа на обеих витринах', async ({ page, request }) => {
  await page.goto(`/product/${PACK.id}`);
  await page.getByRole('button', { name: /В корзину/ }).click();
  await page.goto('/cart');
  const drivee = page.locator('.delivery-radio-grid label:has(input[value="drivee"])');
  const driveeName = (await drivee.locator('strong').innerText()).trim();
  await drivee.locator('input').click();
  await page.locator('#checkout-address').fill('Санкт-Петербург, тестовый адрес');
  await fillNextCheckout(page);
  await page.getByRole('button', { name: 'Оформить демо-заказ', exact: true }).click();
  await expect(page).toHaveURL(/\/order\/NH-[A-F0-9]+\?token=[a-f0-9]{32}/);
  await expect(page.locator('.cart-item-row').first()).toBeVisible();
  expect((await page.locator('aside, main').allInnerTexts()).join('\n')).toContain(driveeName);

  await page.goto(`${staticURL}/#dept-${PACK.category}`);
  const card = page.locator(`.product-card[data-product-id="${PACK.id}"]`);
  await card.locator('.add-btn').click();
  await page.locator('#header-cart-btn').click();
  const staticDrivee = page.locator('.delivery-option-btn[data-deliv-id="drivee"]');
  expect((await staticDrivee.locator('strong').innerText()).trim()).toBe(driveeName);
  await staticDrivee.click();
  await page.locator('#courier-address-input').fill('Санкт-Петербург, тестовый адрес');
  await fillStaticCheckout(page);
  await page.locator('#submit-order-btn').click();
  await expect(page.locator('#form-feedback')).toBeVisible();
  await expect(page.locator('#form-feedback')).toContainText(driveeName);
});
