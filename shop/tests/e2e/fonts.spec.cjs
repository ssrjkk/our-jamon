const { test, expect } = require('@playwright/test');

// Гейт шрифтов: чем браузер РЕАЛЬНО нарисовал каждый глиф обеих витрин.
// getPlatformFontsForNode — это вкладка Rendered Fonts из DevTools. font-family в CSS ничего не
// доказывает: next/font добавляет Fallback-семейства без unicode-range, и они перехватывают ₽
// локальным Times. Корпус и стеки берутся со страницы, поверхности — из маршрутов Next и вкладок
// статической витрины; ни одного артикула, цены или текста витрины здесь не повторяется.
const catalog = require('../../lib/catalog.json');
const staticURL = process.env.E2E_STATIC_URL || 'http://127.0.0.1:8765';

const brandFamily = (name) => /geologica|playfair/i.test(name) && !/fallback/i.test(name);
const MIN_GLYPHS = 300;
const MIN_CHARS = 40;
// Символы, которые лежат только в отдельных нарезках (₽ — в latin-ext, № — в cyrillic), и их
// надо пробовать на каждой поверхности, даже если на этой странице цен нет.
const RISKY_GLYPHS = ['₽', '№', 'ё', '—', '·'];

const COLLECTION = `(() => {
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const nodes = [];
  const chars = new Set();
  Array.from(document.querySelectorAll('body *')).forEach((el, i) => {
    if (!visible(el)) return;
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!own) return;
    const firstClass = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '';
    nodes.push({ i, label: el.tagName.toLowerCase() + firstClass, text: own.slice(0, 40) });
    for (const ch of own) if (ch.codePointAt(0) > 0x20) chars.add(ch);
  });
  return { nodes, chars: Array.from(chars) };
})()`;

async function measureRenderedFonts(page, context) {
  const { nodes, chars } = await page.evaluate(COLLECTION);
  const surface = await page.evaluate(() => {
    const icons = Array.from(document.querySelectorAll('.arrow, .arrow-up')).map((el) => {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        cls: el.className,
        mask: cs.maskImage || cs.webkitMaskImage,
        width: parseFloat(cs.width),
        height: parseFloat(cs.height),
        drawn: box.width > 0 && box.height > 0,
        w: Math.round(box.width),
        h: Math.round(box.height),
      };
    });
    return { icons, textArrows: (document.body.innerText.match(/[→↗←]/g) || []).length };
  });
  await page.evaluate(async ({ list, risky }) => {
    document.getElementById('font-probe')?.remove();
    const host = document.createElement('div');
    host.id = 'font-probe';
    host.style.cssText = 'position:fixed;left:0;top:0;width:700px;height:700px;overflow:hidden;background:#fff;z-index:99999';
    // var(), а не вычисленное значение: у Next в --font-serif сидят ссылки на --font-playfair
    // и --font-geologica, а getPropertyValue их не раскрывает.
    for (const stack of ['var(--font-sans)', 'var(--font-serif)']) {
      for (const ch of new Set([...list, ...risky])) {
        const span = document.createElement('span');
        span.dataset.probe = `${stack}|${ch}`;
        span.style.cssText = `font-family:${stack};font-weight:700;font-size:40px;display:inline-block;color:#000`;
        span.textContent = ch;
        host.appendChild(span);
      }
    }
    document.body.appendChild(host);
    await document.fonts.ready;
  }, { list: chars, risky: RISKY_GLYPHS });

  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const keys = await page.$$eval('#font-probe span[data-probe]', (els) => els.map((el) => el.dataset.probe));
  const { nodeIds: probeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '#font-probe span[data-probe]' });

  const read = async (nodeId) => {
    try {
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      return { families: (fonts || []).map((font) => font.familyName), glyphs: (fonts || []).reduce((sum, font) => sum + font.glyphCount, 0) };
    } catch {
      return { families: [], glyphs: 0 };
    }
  };

  // Порядок обхода = порядок querySelectorAll, поэтому индексы из COLLECTION сопоставимы с nodeId.
  const { nodeIds: bodyIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'body *' });
  const rows = new Map(nodes.map((node) => [node.i, { ...node, families: [], glyphs: 0 }]));
  for (const [index, nodeId] of bodyIds.entries()) {
    const row = rows.get(index);
    if (row) Object.assign(row, await read(nodeId));
  }

  const probe = [];
  for (const [index, nodeId] of probeIds.entries()) {
    probe.push({ key: keys[index], ...(await read(nodeId)) });
  }
  // Пустой ответ = глиф ещё не нарисован (шрифты домучиваются). Второй проход, иначе отсутствие
  // замера выглядит как «всё в бренд-шрифте».
  const pending = probe.filter((row) => !row.families.length);
  if (pending.length) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    for (const row of pending) Object.assign(row, await read(probeIds[keys.indexOf(row.key)]));
  }

  await cdp.detach();
  const corpus = Array.from(new Set([...chars, ...RISKY_GLYPHS]));
  return { corpus, probe, text: Array.from(rows.values()), surface };
}

const describe = (rows) => rows.slice(0, 8).map((row) => `  ${row.key || row.label} «${row.text || ''}» → ${row.families.join(', ') || 'ПУСТО'}`).join('\n');

function assertRendered({ name, corpus, probe, text, surface }) {
  const blank = probe.filter((row) => !row.families.length);
  expect(blank, `${name}: ${blank.length} проб не отрисованы, замер не полный:\n${describe(blank)}`).toHaveLength(0);

  const badProbe = probe.filter((row) => !row.families.every(brandFamily));
  expect(badProbe, `${name}: ${badProbe.length} символов нарисованы вне бренд-гарнитур:\n${describe(badProbe)}`).toHaveLength(0);

  const badText = text.filter((row) => row.families.length && !row.families.every(brandFamily));
  expect(badText, `${name}: ${badText.length} текстовых узлов нарисованы вне бренд-гарнитур:\n${describe(badText)}`).toHaveLength(0);

  const measured = text.filter((row) => row.families.length);
  expect(measured.length, `${name}: измерено всего ${measured.length} текстовых узлов — страница не собралась`).toBeGreaterThan(10);
  const glyphs = measured.reduce((sum, row) => sum + row.glyphs, 0);
  expect(glyphs, `${name}: замер покрыл только ${glyphs} глифов — слишком мало, чтобы что-то утверждать`).toBeGreaterThan(MIN_GLYPHS);
  expect(corpus.length, `${name}: корпус символов обсох до ${corpus.length}`).toBeGreaterThan(MIN_CHARS);

  for (const stack of ['var(--font-sans)', 'var(--font-serif)']) {
    for (const ch of RISKY_GLYPHS) {
      const row = probe.find((item) => item.key === `${stack}|${ch}`);
      expect(row, `${name}: нет пробы «${ch}» в стеке ${stack}`).toBeTruthy();
      expect(row.families.every(brandFamily), `${name}: «${ch}» в стеке ${stack} рисует ${row.families.join(', ') || 'ПУСТО'}`).toBe(true);
    }
  }

  expect(surface.textArrows, `${name}: в видимом тексте остались ${surface.textArrows} символьных стрелок — их рисует системный шрифт`).toBe(0);
  const badIcons = surface.icons.filter((icon) => !/svg/i.test(icon.mask) || !(icon.width >= 6 && icon.height >= 6) || (icon.drawn && (icon.w < 6 || icon.h < 6)));
  expect(badIcons, `${name}: масочные стрелки собраны неверно:\n${badIcons.map((icon) => `  ${icon.cls} mask=${String(icon.mask).slice(0, 40)} … ${icon.width}×${icon.height}${icon.drawn ? ` (в кадре ${icon.w}×${icon.h})` : ' (вне кадра)'}`).join('\n')}`).toHaveLength(0);
}

const NEXT_SURFACES = [
  ['Next: главная', '/'],
  ['Next: каталог', '/catalog'],
  ['Next: корзина', '/cart'],
  ['Next: о нас', '/about'],
  ['Next: товар', `/product/${catalog.products[0].id}`],
  // Разреженные страницы тоже под гейтом: у них свой шаблон вёрстки, а шрифт наследуется от body.
  // Замер дал 36 узлов / 1065 глифов / корпус 85 — пороги assertRendered к ним применимы как есть.
  ['Next: админка', '/admin'],
  ['Next: страница не найдена', '/net-takoy-stranitsy'],
];

const STATIC_TABS = ['catalog', 'scenarios', 'buyer-choices', 'shop', 'about', 'aging', 'weight-system', 'delivery'];

for (const [name, path] of NEXT_SURFACES) {
  test(name, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'отрисовка шрифта не зависит от вьюпорта');
    test.setTimeout(120000);
    await page.goto(path, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    assertRendered({ name, ...(await measureRenderedFonts(page, context)) });
  });
}

for (const tab of STATIC_TABS) {
  test(`Статика: ${tab}`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'отрисовка шрифта не зависит от вьюпорта');
    test.setTimeout(120000);
    await page.goto(`${staticURL}/index.html#catalog`, { waitUntil: 'networkidle' });
    await page.locator(`.site-tabs [data-tab="${tab}"]`).click({ timeout: 5000 });
    await page.waitForTimeout(250);
    await page.evaluate(() => document.fonts.ready);
    assertRendered({ name: `Статика: ${tab}`, ...(await measureRenderedFonts(page, context)) });
  });
}

// Значок обязан не только иметь размеры в CSS, но и попадать в кадр там, где он виден покупателю.
const VISIBLE_ICON_SURFACES = [['Next: главная', '/'], ['Статика: лавка', `${staticURL}/index.html#catalog`, 'shop']];

for (const [name, url, tab] of VISIBLE_ICON_SURFACES) {
  test(`${name}: стрелка-значок в кадре`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'отрисовка шрифта не зависит от вьюпорта');
    await page.goto(url, { waitUntil: 'networkidle' });
    if (tab) {
      await page.locator(`.site-tabs [data-tab="${tab}"]`).click({ timeout: 5000 });
      await page.waitForTimeout(250);
    }
    const icon = page.locator('.arrow, .arrow-up').first();
    await icon.scrollIntoViewIfNeeded();
    const box = await icon.boundingBox();
    expect(box, `${name}: первый значок-стрелка не отрисован`).not.toBeNull();
    expect(Math.round(box.width), `${name}: значок-стрелка схлопнут по ширине`).toBeGreaterThanOrEqual(6);
    expect(Math.round(box.height), `${name}: значок-стрелка схлопнут по высоте`).toBeGreaterThanOrEqual(6);
  });
}
