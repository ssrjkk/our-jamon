const { expect } = require('@playwright/test');

// Пароль совпадает с ADMIN_PASSWORD в playwright.config.cjs: тесты всегда пишут его одним местом.
const ADMIN_PASSWORD = 'test-only-admin-passphrase';

async function createOrder(api, items, deliveryId = 'pickup') {
  const quoted = await api.post('/api/cart', { data: { items, deliveryId } });
  expect(quoted.status()).toBe(200);
  const { quote } = await quoted.json();
  const created = await api.post('/api/orders', { data: { items, customer: { name: 'Локальный тест', phone: '+79991234567' }, consent: true, messenger: 'SMS', deliveryId, deliveryAddress: deliveryId === 'pickup' ? '' : 'Тестовый адрес', expectedItemsSum: quote.itemsSum, expectedDeliveryCost: quote.delivery.cost } });
  expect(created.status()).toBe(201);
  return { ...await created.json(), quote };
}

/** Панель заказов открывается только после входа; список приходит уже после гидратации. */
async function loginAdmin(page) {
  await page.goto('/admin');
  await page.getByLabel('Пароль администратора').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.locator('.admin-order-card').first()).toBeVisible();
}

// Клик по Next-контролу до конца гидратации уходит в пустоту: серверный HTML уже
// отрисован и выглядит готовым, а React навешивает обработчики на корень в самом
// конце. Полный прогон 2026-11-13 потерял именно так клик «В корзину»: гейт движения
// ждал токен 10 с и падал не на глушении анимации, а на том, что добавления не было.
// Видимого признака готовности у кнопки нет — `toBeEnabled()` проходит и до обработчиков.
// Признак наблюдаемый: у самого элемента появляются React-пропсы. В покое на этой машине
// это наступает через 179–1054 мс после load (test-results/hydration-probe.cjs), поэтому
// ждать приходится опросом, а не фиксированной задержкой.
//
// Статическую витрину это не касается: её обработчики навешивает inline-скрипт на
// DOMContentLoaded (index.html:2378, документная делегация — index.html:2393), а load,
// который дожидается page.goto, наступает после DOMContentLoaded всегда.
async function готовККлику(контрол, метка) {
  await expect.poll(async () => контрол
    .evaluate((элемент) => Object.keys(элемент).some((ключ) => ключ.startsWith('__react')))
    .catch(() => false),
  { timeout: 20000, message: `${метка}: контрол не гидратировался, клик ушёл бы в пустоту` }).toBe(true);
  return контрол;
}

async function добавитьВКорзину(page, метка = 'карточка товара') {
  const контрол = page.getByRole('button', { name: /В корзину/ });
  await готовККлику(контрол, метка);
  await контрол.click();
}

module.exports = { ADMIN_PASSWORD, createOrder, loginAdmin, готовККлику, добавитьВКорзину };
