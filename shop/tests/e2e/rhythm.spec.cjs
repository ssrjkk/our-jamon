const { test, expect } = require('@playwright/test');
const catalog = require('../../lib/catalog.json');
const { createOrder, loginAdmin } = require('./helpers.cjs');

// Сброс `* { margin: 0 }` оставляет блочным контейнерам единственный способ развести
// детей — gap или отступ. Там, где контейнер появился позже таблицы стилей (панель лавки,
// страница заказа, шапки корзины), строки текста вставали вплотную друг к другу.
// Измеряем расстояние между реальными строками текста у соседей по вертикали — так видно
// и блок без отступов, и сетку с gap: 0. Инлайн-детей не сверяем: это один текстовый поток.
// Статическая витрина вне этой проверки: у неё номер выдержки над подписью стоит встык
// осознанно, и её таблица стилей живёт в том же файле, что и разметка.
const PACK = catalog.products.find((product) => product.kind === 'pack' && product.packs?.[0]?.price > 0);
const PIECE = catalog.products.find((product) => product.kind === 'piece' && product.pricePerKg > 0);
const TABS = ['catalog', 'scenarios', 'buyer-choices', 'aging', 'weight-system', 'shop', 'delivery'];
const MIN_LINE_GAP = 2;
const MIN_CARD_GAP = 8;
const MIN_PAIRS = 200;

const RHYTHM = ({ minLineGap, minCardGap }) => {
  const lineRects = (el) => {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim()) continue;
      const host = node.parentElement;
      if (!host) continue;
      const style = getComputedStyle(host);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.height > 1 && rect.width > 1) out.push(rect);
    }
    return out;
  };
  const box = (el) => el.getBoundingClientRect();
  const inFlow = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'absolute' || style.position === 'fixed') return false;
    const rect = box(el);
    return rect.height > 4 && rect.width > 4;
  };
  const glued = [];
  let scanned = 0;
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (!box(el).height) continue;
    const kids = [...el.children].filter((kid) => inFlow(kid) && /^(block|flex|grid|list-item|table)/.test(getComputedStyle(kid).display));
    for (let i = 1; i < kids.length; i += 1) {
      const above = box(kids[i - 1]);
      const below = box(kids[i]);
      // сосед снизу, а не рядом: верх B должен быть ниже середины A
      if (below.top < above.top + above.height / 2) continue;
      const shared = Math.min(above.right, below.right) - Math.max(above.left, below.left);
      if (shared < 0.6 * Math.min(above.width, below.width)) continue;
      const aboveLines = lineRects(kids[i - 1]);
      const belowLines = lineRects(kids[i]);
      if (!aboveLines.length || !belowLines.length) continue;
      scanned += 1;
      const gap = Math.min(...belowLines.map((rect) => rect.top)) - Math.max(...aboveLines.map((rect) => rect.bottom));
      if (gap < minLineGap) glued.push({
        host: `${el.tagName.toLowerCase()}.${el.className || '—'}`.slice(0, 40),
        pair: `${(kids[i - 1].textContent || '').trim().slice(0, 18)}↕${(kids[i].textContent || '').trim().slice(0, 18)}`,
        gap: +gap.toFixed(1),
      });
    }
  }
  const cardGaps = [...document.querySelectorAll('.admin-orders > .admin-order-card')].slice(1).map((card, index) => {
    const previous = card.parentElement.children[index].getBoundingClientRect();
    return +(card.getBoundingClientRect().top - previous.bottom).toFixed(1);
  });
  return { glued, scanned, cardGaps, tooCloseCards: cardGaps.filter((gap) => gap < minCardGap) };
};

test('ни один блочный контейнер не склеивает строки текста, а карточки заказов разведены', async ({ page, request }, info) => {
  const orderA = await createOrder(request, [{ productId: PACK.id, kind: 'pack', packIdx: 0, qty: 1 }], 'pickup');
  const orderB = await createOrder(request, [{ productId: PIECE.id, kind: 'custom', weightG: 300 }], 'cdek');
  const report = [];
  let scanned = 0;
  const check = async (route) => {
    const result = await page.evaluate(RHYTHM, { minLineGap: MIN_LINE_GAP, minCardGap: MIN_CARD_GAP });
    scanned += result.scanned;
    for (const hit of result.glued) report.push(`${route}: ${hit.host} зазор ${hit.gap}px у «${hit.pair}»`);
    if (result.cardGaps.length) {
      expect(result.tooCloseCards, `${route}: карточки заказов стоят ближе ${MIN_CARD_GAP}px — ${JSON.stringify(result.cardGaps)}`).toEqual([]);
    }
  };

  for (const tab of TABS) {
    await page.goto(`/#${tab}`);
    await expect(page.locator(`#${tab}`)).toBeVisible();
    await check(`/#${tab}`);
  }
  for (const route of ['/', '/catalog', '/about', '/cart', `/product/${PACK.id}`, `/order/${orderA.orderId}?token=${orderA.accessToken}`, `/order/${orderB.orderId}?token=${orderB.accessToken}`]) {
    await page.goto(route);
    await expect(page.locator('main#main-content')).toBeVisible();
    await check(route);
  }
  await loginAdmin(page);
  await check('/admin');

  expect(scanned, `${info.project.name}: свип сверил только ${scanned} пар строк — проверка потеряла опору`).toBeGreaterThanOrEqual(MIN_PAIRS);
  expect(report, `${info.project.name}: строки текста склеены:\n${report.join('\n')}`).toEqual([]);
});
