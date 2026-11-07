import { Product, Country } from './types';

// =========================================================================
// Каталог лавки. Цены хамона и ног — по прайсу поставщика «Дом Хамона»
// (domhamona.ru, ГОСТ 34159-2017): 8-22 мес = 2200-3600 ₽/кг,
// целые ноги 24/26 мес = 30 000/35 000 ₽/шт.
// ИНТЕГРАЦИЯ 1С: см. getProducts() в конце файла.
// =========================================================================

export const COUNTRY_NAMES: Record<Country, string> = {
  ru: 'Россия',
  es: 'Испания',
  it: 'Италия',
  gr: 'Греция',
  fr: 'Франция',
  ch: 'Швейцария',
};

export const CATEGORY_TITLES: Record<string, { title: string; note: string }> = {
  piece: { title: 'Хамон куском', note: 'Каждый кусок взвешен при приёмке — внутри карточки выбирается конкретный кусок по весу, цена считается по факту до рубля.' },
  sliced: { title: 'Хамон в нарезке', note: 'Вакуумные пачки 50-150 г — фиксированная цена, оплата сразу.' },
  leg: { title: 'Целые ноги и палеты', note: 'Окорока выдержки 24-26 месяцев с фиксированной ценой за ногу и лопатки (палета) — хамонера покупается отдельно.' },
  olives: { title: 'Оливки и антипасти', note: 'Банки фиксированной фасовки и оливки на развес с ползунком веса.' },
  cheese: { title: 'Сыры и колбасы', note: 'Манчего, чоризо и выдержанные сыры Италии, Греции, Франции и Швейцарии.' },
  extras: { title: 'Хамонеры и подарки', note: 'Подставки, нож для нарезки и подарочные сертификаты.' },
};

export const DEPT_ORDER: { cat: string; id: string }[] = [
  { cat: 'piece', id: 'dept-piece' },
  { cat: 'sliced', id: 'dept-sliced' },
  { cat: 'leg', id: 'dept-leg' },
  { cat: 'olives', id: 'dept-olives' },
  { cat: 'cheese', id: 'dept-cheese' },
  { cat: 'extras', id: 'dept-extras' },
];

export const PRODUCTS: Product[] = [
  { id: 'hamon-8-piece', country: 'ru', category: 'piece', title: 'Хамон «8», кусок в вакууме', agingMonths: 8,
    description: 'Свежий вкус, минимум соли. Новая партия — по предзаказу, 2 000 ₽/кг.',
    kind: 'piece', pricePerKg: 2200,
    pieces: [{ id1c: '1c-h8-210', weightG: 210 }, { id1c: '1c-h8-280', weightG: 280 }, { id1c: '1c-h8-350', weightG: 350 }],
    packs: [], bulk: null },
  { id: 'hamon-10-piece', country: 'ru', category: 'piece', title: 'Хамон «10», кусок в вакууме', agingMonths: 10,
    description: 'Деликатная солёность, сочная мякоть. Для брускетт.',
    kind: 'piece', pricePerKg: 2400,
    pieces: [{ id1c: '1c-h10-220', weightG: 220 }, { id1c: '1c-h10-290', weightG: 290 }, { id1c: '1c-h10-360', weightG: 360 }],
    packs: [], bulk: null },
  { id: 'hamon-12-piece', country: 'ru', category: 'piece', title: 'Хамон «12», кусок в вакууме', agingMonths: 12,
    description: 'Мягкий вкус — лучшее знакомство с хамоном.',
    kind: 'piece', pricePerKg: 2600,
    pieces: [{ id1c: '1c-h12-215', weightG: 215 }, { id1c: '1c-h12-290', weightG: 290 }, { id1c: '1c-h12-360', weightG: 360 }],
    packs: [], bulk: null },
  { id: 'hamon-14-piece', country: 'ru', category: 'piece', title: 'Хамон «14», кусок в вакууме', agingMonths: 14,
    description: 'Первый намёк на ореховую ноту, плотный срез.',
    kind: 'piece', pricePerKg: 2800,
    pieces: [{ id1c: '1c-h14-225', weightG: 225 }, { id1c: '1c-h14-295', weightG: 295 }, { id1c: '1c-h14-365', weightG: 365 }],
    packs: [], bulk: null },
  { id: 'hamon-16-piece', country: 'ru', category: 'piece', title: 'Хамон «16», кусок в вакууме', agingMonths: 16,
    description: 'Рубиновый срез, ореховая нота.',
    kind: 'piece', pricePerKg: 3000,
    pieces: [{ id1c: '1c-h16-230', weightG: 230 }, { id1c: '1c-h16-300', weightG: 300 }, { id1c: '1c-h16-380', weightG: 380 }],
    packs: [], bulk: null },
  { id: 'hamon-18-piece', country: 'ru', category: 'piece', title: 'Хамон «18», кусок в вакууме', agingMonths: 18,
    description: 'Насыщенный вкус, тающий жир.',
    kind: 'piece', pricePerKg: 3200,
    pieces: [{ id1c: '1c-h18-240', weightG: 240 }, { id1c: '1c-h18-310', weightG: 310 }, { id1c: '1c-h18-390', weightG: 390 }],
    packs: [], bulk: null },
  { id: 'hamon-20-piece', country: 'ru', category: 'piece', title: 'Хамон «20», кусок в вакууме', agingMonths: 20,
    description: 'Тёмный срез, тающий жир, глубокий вкус.',
    kind: 'piece', pricePerKg: 3400,
    pieces: [{ id1c: '1c-h20-235', weightG: 235 }, { id1c: '1c-h20-305', weightG: 305 }, { id1c: '1c-h20-375', weightG: 375 }],
    packs: [], bulk: null },
  { id: 'hamon-22-piece', country: 'ru', category: 'piece', title: 'Хамон «22», кусок в вакууме', agingMonths: 22,
    description: 'Кристаллы тирозина, глубокий умами.',
    kind: 'piece', pricePerKg: 3600,
    pieces: [{ id1c: '1c-h22-220', weightG: 220 }, { id1c: '1c-h22-280', weightG: 280 }, { id1c: '1c-h22-350', weightG: 350 }],
    packs: [], bulk: null },
  { id: 'hamon-leg-24', country: 'ru', category: 'leg', title: 'Целая нога хамона «24» на кости', agingMonths: 24,
    description: 'Около 8,5 кг. Хамонера — отдельно.',
    kind: 'piece', pricePerKg: 3530,
    pieces: [
      { id1c: '1c-leg24-8400', weightG: 8400, price: 30000 },
      { id1c: '1c-leg24-8600', weightG: 8600, price: 30000 },
    ],
    packs: [], bulk: null },
  { id: 'hamon-leg-26', country: 'ru', category: 'leg', title: 'Целая нога хамона «26» на кости', agingMonths: 26,
    description: 'Топовая выдержка. Около 8,5 кг.',
    kind: 'piece', pricePerKg: 4118,
    pieces: [
      { id1c: '1c-leg26-8400', weightG: 8400, price: 35000 },
      { id1c: '1c-leg26-8600', weightG: 8600, price: 35000 },
    ],
    packs: [], bulk: null },
  { id: 'paleta-18', country: 'ru', category: 'leg', title: 'Палета «18» на кости (лопатка)', agingMonths: 18,
    description: 'Лопатка 4-6 кг — компактная альтернатива ноге.',
    kind: 'piece', pricePerKg: 2800,
    pieces: [{ id1c: '1c-pal18-4600', weightG: 4600 }, { id1c: '1c-pal18-5200', weightG: 5200 }],
    packs: [], bulk: null },
  { id: 'hamon-sliced-14', country: 'ru', category: 'sliced', title: 'Нарезка хамона «14»', agingMonths: 14,
    description: 'Мягкая выдержка. Совет: прогрейте вакуумную упаковку в тёплой воде 40–50 °C — слайсы отделятся целыми.',
    kind: 'pack', pricePerKg: 3900,
    pieces: [], packs: [
      { label: '100 г в вакууме', weightG: 100, price: 390 },
      { label: '150 г в вакууме', weightG: 150, price: 570 },
    ], bulk: null },
  { id: 'hamon-sliced-22', country: 'ru', category: 'sliced', title: 'Нарезка хамона «22»', agingMonths: 22,
    description: 'Самый насыщенный срез. Совет: прогрейте упаковку в тёплой воде 40–50 °C.',
    kind: 'pack', pricePerKg: 4500,
    pieces: [], packs: [
      { label: '100 г в вакууме', weightG: 100, price: 450 },
      { label: '150 г в вакууме', weightG: 150, price: 660 },
    ], bulk: null },
  { id: 'hamon-tasting-sliced', country: 'ru', category: 'sliced', title: 'Дегустационный сет нарезок 3 × 100 г', agingMonths: null,
    description: 'Три выдержки, чтобы понять свой вкус.',
    kind: 'pack', pricePerKg: 3800,
    pieces: [], packs: [
      { label: 'Сет 3 × 100 г', weightG: 300, price: 1150 },
    ], bulk: null },
  { id: 'olives-gordal', country: 'es', category: 'olives', title: 'Оливки Gordal крупные', agingMonths: null,
    description: 'Крупные зелёные, из Андалусии.',
    kind: 'pack', pricePerKg: 1800,
    pieces: [], packs: [{ label: 'Банка 350 г', weightG: 350, price: 590 }],
    bulk: { minG: 100, maxG: 1000, stepG: 50, pricePerKg: 1800 } },
  { id: 'olives-manzanilla', country: 'es', category: 'olives', title: 'Оливки Manzanilla', agingMonths: null,
    description: 'Нежные, без косточки.',
    kind: 'pack', pricePerKg: 1800,
    pieces: [], packs: [{ label: 'Упаковка 250 г', weightG: 250, price: 450 }],
    bulk: { minG: 100, maxG: 1000, stepG: 50, pricePerKg: 1800 } },
  { id: 'tomatoes-dried', country: 'it', category: 'olives', title: 'Вяленые томаты в масле', agingMonths: null,
    description: 'С орегано, в оливковом масле.',
    kind: 'pack', pricePerKg: 3400,
    pieces: [], packs: [{ label: 'Банка 200 г', weightG: 200, price: 680 }], bulk: null },
  { id: 'cheese-manchego', country: 'es', category: 'cheese', title: 'Сыр овечий Манчего', agingMonths: 12,
    description: 'Выдержанный овечий сыр.',
    kind: 'pack', pricePerKg: 4760,
    pieces: [], packs: [{ label: 'Кусок 250 г', weightG: 250, price: 1190 }], bulk: null },
  { id: 'chorizo-iberico', country: 'es', category: 'cheese', title: 'Чоризо сыровяленая', agingMonths: null,
    description: 'Сыровяленая, с паприкой Pimentón.',
    kind: 'pack', pricePerKg: 3950,
    pieces: [], packs: [{ label: 'Упаковка 200 г', weightG: 200, price: 790 }], bulk: null },
  { id: 'grissini', country: 'it', category: 'cheese', title: 'Гриссини хлебные палочки', agingMonths: null,
    description: 'Хрустящие, на оливковом масле.',
    kind: 'pack', pricePerKg: 1950,
    pieces: [], packs: [{ label: 'Упаковка 200 г', weightG: 200, price: 390 }], bulk: null },
  { id: 'prosciutto-crudo', country: 'it', category: 'sliced', title: 'Прошутто крудо, нарезка', agingMonths: null,
    description: 'Сыровяленая ветчина, 18 месяцев.',
    kind: 'pack', pricePerKg: 6900,
    pieces: [], packs: [
      { label: '100 г в вакууме', weightG: 100, price: 690 },
      { label: '150 г в вакууме', weightG: 150, price: 990 },
    ], bulk: null },
  { id: 'parmigiano-24', country: 'it', category: 'cheese', title: 'Пармиджано 24 месяца', agingMonths: 24,
    description: 'Твёрдый, 24 месяца выдержки.',
    kind: 'pack', pricePerKg: 6400,
    pieces: [], packs: [{ label: 'Кусок 250 г', weightG: 250, price: 1600 }], bulk: null },
  { id: 'olives-kalamata', country: 'gr', category: 'olives', title: 'Оливки Каламата', agingMonths: null,
    description: 'Тёмные, с винным ароматом.',
    kind: 'pack', pricePerKg: 1900,
    pieces: [], packs: [{ label: 'Банка 300 г', weightG: 300, price: 570 }],
    bulk: { minG: 100, maxG: 1000, stepG: 50, pricePerKg: 1900 } },
  { id: 'feta-herbs', country: 'gr', category: 'cheese', title: 'Фета в травах', agingMonths: null,
    description: 'В маринаде с орегано.',
    kind: 'pack', pricePerKg: 3600,
    pieces: [], packs: [{ label: 'Упаковка 200 г', weightG: 200, price: 720 }], bulk: null },
  { id: 'comte-18', country: 'fr', category: 'cheese', title: 'Конт 18 месяцев', agingMonths: 18,
    description: 'Ореховая сладость, 18 месяцев.',
    kind: 'pack', pricePerKg: 5900,
    pieces: [], packs: [{ label: 'Кусок 250 г', weightG: 250, price: 1475 }], bulk: null },
  { id: 'gruyere', country: 'ch', category: 'cheese', title: 'Грюйер выдержанный', agingMonths: 12,
    description: 'Фруктово-ореховый вкус.',
    kind: 'pack', pricePerKg: 6200,
    pieces: [], packs: [{ label: 'Кусок 250 г', weightG: 250, price: 1550 }], bulk: null },
  { id: 'hamonera-pine-light', country: 'ru', category: 'extras', title: 'Хамонера «Сосна светлая»', agingMonths: null,
    description: 'Артикул HR-01. Подставка для целой ноги из светлой сосны.',
    kind: 'pack', pricePerKg: 0,
    pieces: [], packs: [{ label: 'Хамонера', weightG: 0, price: 4000 }], bulk: null },
  { id: 'hamonera-pine-dark', country: 'ru', category: 'extras', title: 'Хамонера «Сосна тёмная»', agingMonths: null,
    description: 'Артикул HR-02. Тонированная сосна — строгий вариант.',
    kind: 'pack', pricePerKg: 0,
    pieces: [], packs: [{ label: 'Хамонера', weightG: 0, price: 4000 }], bulk: null },
  { id: 'hamonera-oak-light', country: 'ru', category: 'extras', title: 'Хамонера «Дуб светлый»', agingMonths: null,
    description: 'Артикул HR-03. Массив дуба — на годы. [розничная уточнить]',
    kind: 'pack', pricePerKg: 0,
    pieces: [], packs: [{ label: 'Хамонера', weightG: 0, price: 5000 }], bulk: null },
  { id: 'hamonera-oak-dark', country: 'ru', category: 'extras', title: 'Хамонера «Дуб тёмный»', agingMonths: null,
    description: 'Артикул HR-04. Тёмный дуб, самая солидная подставка. [розничная уточнить]',
    kind: 'pack', pricePerKg: 0,
    pieces: [], packs: [{ label: 'Хамонера', weightG: 0, price: 5000 }], bulk: null },
  { id: 'hamon-knife', country: 'ru', category: 'extras', title: 'Фирменный нож «Дом Хамона»', agingMonths: null,
    description: 'Артикул KN. Острый, как бритва, — для идеальных слайсов.',
    kind: 'pack', pricePerKg: 0,
    pieces: [], packs: [{ label: 'Нож 24 см', weightG: 0, price: 1700 }], bulk: null },
  { id: 'gift-certificate', country: 'ru', category: 'extras', title: 'Подарочный сертификат', agingMonths: null,
    description: 'Именной, с индивидуальным номером. Оплатит покупку целиком или частично.',
    kind: 'pack', pricePerKg: 0,
    pieces: [], packs: [
      { label: 'Сертификат на 3 000 ₽', weightG: 0, price: 3000 },
      { label: 'Сертификат на 5 000 ₽', weightG: 0, price: 5000 },
      { label: 'Сертификат на 10 000 ₽', weightG: 0, price: 10000 }
    ], bulk: null },
];

export function findProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function piecePriceOf(product: Product, weightG: number, fixedPrice?: number): number {
  if (typeof fixedPrice === 'number') return fixedPrice;
  return Math.round((weightG / 1000) * product.pricePerKg);
}

export function calcPricePer100g(pricePerKg: number): number {
  return Math.round(pricePerKg / 10);
}

export const SETS = [
  { id: 'evening', kicker: 'Набор к столу', title: 'Вкусный вечер', featured: true,
    desc: 'Собрали то, что чаще всего берут одним махом к бокалу.',
    components: [
      { productId: 'hamon-sliced-22', optionIdx: 0 },
      { productId: 'olives-gordal', optionIdx: 0 },
      { productId: 'grissini', optionIdx: 0 },
    ] },
  { id: 'gift', kicker: 'Подарочный набор', title: 'Бокс «В подарок»',
    desc: 'Нарезка длительной выдержки, оливки и выдержанный сыр — в аккуратной сборке.',
    components: [
      { productId: 'hamon-sliced-22', optionIdx: 1 },
      { productId: 'olives-manzanilla', optionIdx: 0 },
      { productId: 'cheese-manchego', optionIdx: 0 },
    ] },
  { id: 'wine', kicker: 'Тарелка к вину', title: 'Винная тарелка',
    desc: 'Мягкая нарезка «14», сыровяленая чоризо и крупные Gordal.',
    components: [
      { productId: 'hamon-sliced-14', optionIdx: 1 },
      { productId: 'chorizo-iberico', optionIdx: 0 },
      { productId: 'olives-gordal', optionIdx: 0 },
    ] },
];

// =========================================================================
// ИНТЕГРАЦИЯ 1С:УНФ 3.0
// Если задан ONEC_API_URL — получаем каталог оттуда (формат тот же, что PRODUCTS).
// Пока переменной нет — работает мок-каталог выше.
// =========================================================================
export async function getProducts(): Promise<Product[]> {
  const url = process.env.ONEC_API_URL;
  if (!url) return PRODUCTS;
  try {
    const res = await fetch(url, {
      headers: process.env.ONEC_TOKEN ? { Authorization: `Bearer ${process.env.ONEC_TOKEN}` } : {},
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`1C responded ${res.status}`);
    const data = (await res.json()) as { products?: Product[] } | Product[];
    const list = Array.isArray(data) ? data : data.products;
    if (Array.isArray(list) && list.length) return list;
  } catch (e) {
    console.error('1C fetch failed, fallback to mock catalog:', e);
  }
  return PRODUCTS;
}
