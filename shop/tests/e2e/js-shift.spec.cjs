// Полосу историй наполняет скрипт на DOMContentLoaded. Пока она пустая, она не занимает
// ничего, и в момент наполнения всё, что ниже, уезжает на высоту пузыря (110 px). Браузер
// засчитывает это в CLS: на tablet тест показал 0.2219 при пороге 0.1 — и показал не каждый
// прогон, а только когда скрипт дозревал после первой отрисовки. Намеренно выигранная
// гонка не является проверкой, поэтому здесь гонки нет вовсе: измеряется геометрия, а не
// тайминги. Инвариант один — пустая полоса обязана занимать ровно столько же, сколько
// занимает наполненная, тогда наполнять ее нечем сдвигать.
//
// Проверка кусается сама: четвёртый кейс снимает резерв на живой странице и обязан увидеть
// дырку. Без него гейт молча позеленел бы, если бы кто-то убрал и резерв, и пузыри сразу.
const { test, expect } = require('@playwright/test');

const staticURL = process.env.E2E_STATIC_URL || 'http://127.0.0.1:8765';
const адрес = `${staticURL}/index.html`;

// Высота полосы и вершина первого блока под ней. Сосед меряется не для красоты: резерв может
// совпасть с высотой полосы, а сдвиг всё равно даст другой узел того же ряда.
const СНЯТОК = `(() => {
  const полоса = document.getElementById('stories-strip');
  const сосед = document.querySelector('.catalog-intro');
  const снять = () => ({
    полоса: полоса.getBoundingClientRect().height,
    сосед: сосед.getBoundingClientRect().top + window.scrollY,
    пузырей: полоса.children.length,
  });
  const заполнена = снять();
  const было = полоса.innerHTML;
  полоса.innerHTML = '';
  void полоса.offsetHeight;
  const пустая = снять();
  полоса.innerHTML = было;
  void полоса.offsetHeight;
  return { заполнена, пустая };
})()`;

const ВЬЮПОРТЫ = [360, 768, 1440];

/**
 * У витрины стоит анти-анимационный тумблер на prefers-reduced-motion (transition-duration
 * 0.001 ms по всему дереву), и он превращает смену min-height в переход: если мерить
 * синхронно сразу после правки, getComputedStyle ещё отдаёт старое значение. Ждём, пока
 * переходы узла закончатся, — иначе мутационный кейс проверял бы сам себя по устаревшим данным.
 */
async function переходыУзла(page, селектор) {
  await page.evaluate((с) => Promise.all(
    [...document.querySelector(с).getAnimations()].map((а) => а.finished.catch(() => null)),
  ), селектор);
}

test('наполнение полосы историй не двигает то, что под ней', async ({ page }) => {
  // Вьюпоры перебираются внутри одного теста: резерв считается от ширины, а проект в наборе
  // один — гонять три одинаковых проверки на каждом проекте значит умножать цену на три.
  test.skip(test.info().project.name !== 'desktop', 'геометрия не зависит от проекта, ширины перебираются здесь');
  await page.goto(адрес, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('#stories-strip .story-bubble').length))
    .toBeGreaterThan(0);

  for (const ширина of ВЬЮПОРТЫ) {
    await page.setViewportSize({ width: ширина, height: 1024 });
    const { заполнена, пустая } = await page.evaluate(СНЯТОК);
    expect(пустая.пузырей, `Pages ${ширина}px: полоса оказалась заполненной даже очищенной`).toBe(0);
    expect(заполнена.полоса, `Pages ${ширина}px: наполненная полоса не занимает ряд пузырей`).toBeGreaterThanOrEqual(110);
    expect(Math.abs(заполнена.полоса - пустая.полоса),
      `Pages ${ширина}px: пустая полоса ${пустая.полоса.toFixed(2)}px против наполненной ${заполнена.полоса.toFixed(2)}px — ` +
      'на скриптовый узел не зарезервировано место, и при наполнении он двигает вёрстку под собой')
      .toBeLessThanOrEqual(1);
    expect(Math.abs(заполнена.сосед - пустая.сосед),
      `Pages ${ширина}px: каталог под полосой историй уезжает на ${(заполнена.сосед - пустая.сосед).toFixed(2)}px, ` +
      'когда скрипт вставляет пузыри — это и есть сдвиг макета')
      .toBeLessThanOrEqual(1);
  }
});

test('гейт видит снятый резерв: без min-height дырка возвращается', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'достаточно одного проекта');
  await page.goto(адрес, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '.stories-strip { min-height: 0 !important; }' });
  await переходыУзла(page, '#stories-strip');
  const { заполнена, пустая } = await page.evaluate(СНЯТОК);
  const дырка = заполнена.полоса - пустая.полоса;
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('stories-strip')).minHeight),
    'подмена не сняла резерв: инъекция Styles не дошла, и кейс ничего не проверяет').toBe('0px');
  expect(дырка,
    'без резерва полоса занимает ровно столько же, сколько пустая: замер ослеп — он больше не ловит сдвиг')
    .toBeGreaterThanOrEqual(40);
  expect(Math.abs(заполнена.сосед - пустая.сосед),
    'без резерва сосед под полосой не двигается: сдвиг есть, а проверка его не видит').toBeGreaterThanOrEqual(40);
});
