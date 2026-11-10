// Строит каталог витрины по прайсу поставщика «Прайс 0711.xlsx» (выгрузка 1С:УНФ).
// Вход — scripts/price-0711.rows.json (строки прайса как есть), выход — lib/catalog.json.
// Источник названий, цен, групп и составов — только прайс. Запуск: node scripts/build-catalog.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import supplierPhotos from './supplier-photos.json' with { type: 'json' };

const rows = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'price-0711.rows.json'), 'utf8'));

const CATEGORY_BY_PRICE = {
  'Хамон в кусках (весовой)': 'piece',
  'Хамон нарезка': 'sliced',
  'Хамон ножка': 'leg',
  'Оливки и антипасти': 'olives',
  'Сыры': 'cheese',
  'Закуски': 'snacks',
  'Масла': 'oils',
  'Приправы': 'spices',
  'Сладкие дополнения': 'sweets',
  'Аксессуары': 'extras',
  'Сертификат': 'certificate',
};

const CATEGORIES = [
  { cat: 'piece', title: 'Хамон куском', short: 'Весовой кусок', note: 'Весовые куски без кости из прайса: режем под заказ от 50 до 2 000 г. Цена за килограмм подтверждена, итог считаем по фактическому весу.' },
  { cat: 'sliced', title: 'Хамон в нарезке', short: 'Нарезка', note: 'Вакуумные пачки 100 г и соломка 150 г — фиксированная цена за упаковку.' },
  { cat: 'leg', title: 'Хамон ножкой', short: 'Окорок', note: 'Окорока выдержки 8–24 месяцев. В прайсе поставщика цены на ноги нет: стоимость и наличие уточняем перед заказом.' },
  { cat: 'cheese', title: 'Сыры', short: 'Сыр', note: 'Выдержанные сыры «Сальково» из молока А2, вакуумная фасовка 150 г.' },
  { cat: 'olives', title: 'Оливки и антипасти', short: 'Антипасти', note: 'Оливки, артишоки, вяленые томаты, брускетты и соусы — банки фиксированной фасовки.' },
  { cat: 'snacks', title: 'Закуски', short: 'Закуска', note: 'Паштеты, рийеты, фуа-гра, конфитюры и хлебные палочки.' },
  { cat: 'oils', title: 'Масла', short: 'Масло', note: 'Оливковое Extra virgin и трюфельное масло.' },
  { cat: 'spices', title: 'Приправы', short: 'Приправа', note: 'Смеси для гриля, соли и перцы в мельницах.' },
  { cat: 'sweets', title: 'Сладкие дополнения', short: 'Дополнение', note: 'Вяленые фрукты и ягоды без сахара, драже, туррон и томлёные ягоды.' },
  { cat: 'chocolate', title: 'Шоколад KREOLA', short: 'Шоколад', note: 'Плитки ручной работы из прайса. Цену и наличие уточняем в лавке.' },
  { cat: 'extras', title: 'Аксессуары', short: 'Аксессуар', note: 'Хамонеры, нож для нарезки и доски. Цена за штуку, не за вес.' },
  { cat: 'certificate', title: 'Сертификаты', short: 'Сертификат', note: 'Подарочный сертификат. Сумму согласуем при оформлении.' },
];

// Наборы собираются из реальных SKU прайса: packIdx — индекс фасовки в карточке товара.
const KITS = [
  { id: 'self', label: 'Для себя', title: 'Найти свою выдержку',
    description: 'Три нарезки по 100 г — «8», «14» и «22» месяца. Сравните рядом и решите, какая ваша.',
    items: [{ productId: 'nf-00000004', packIdx: 0 }, { productId: 'nf-00000007', packIdx: 0 }, { productId: 'nf-00000009', packIdx: 0 }] },
  { id: 'evening', label: 'К столу', title: 'Вкусный вечер',
    description: 'Нарезка «14», крупные Gordal без косточки и хлебные палочки на оливковом масле.',
    items: [{ productId: 'nf-00000007', packIdx: 0 }, { productId: 'nf-00000229', packIdx: 0 }, { productId: 'nf-00000241', packIdx: 0 }] },
  { id: 'gift', label: 'На подарок', title: 'Хорошая компания',
    description: 'Выдержка «24», сыр «Сальково» 24 месяцев и вяленые томаты с чесноком и базиликом.',
    items: [{ productId: 'nf-00000010', packIdx: 0 }, { productId: 'nf-00000112', packIdx: 0 }, { productId: 'nf-00000235', packIdx: 0 }] },
];

// Плитки KREOLA: в прайсе лежат в «Сладких дополнениях», на витрине — отдельной группой.
const KREOLA_CODES = new Set(['НФ-00000295', 'НФ-00000296', 'НФ-00000297', 'НФ-00000298', 'НФ-00000299',
  'НФ-00000300', 'НФ-00000301', 'НФ-00000302', 'НФ-00000303', 'НФ-00000307', 'НФ-00000308']);

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const slugify = (value) => value
  .toLowerCase().split('').map((char) => TRANSLIT[char] ?? char).join('')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Выдержка из наименования: «выдержка 10 мес» и «10 мес.» → 10, остальное → null.
const agingOf = (title) => {
  const match = title.match(/выдержка (\d{1,2})\s*мес|(\d{1,2})\s*мес/);
  return match ? Number(match[1] ?? match[2]) : null;
};

// Типографика витрины: «ёлочки» вместо кавычек-лапок, длинное тире вместо дефиса-связки.
const typography = (value) => value
  .replace(/"([^"]*)"/g, '«$1»')
  .replace(/(\s)-(\s)/g, '$1—$2');

// =========================================================================
// 2. СТРОКИ ПРАЙСА → ТОВАРЫ С ЦЕНОЙ И ПРЕВЬЮ БЕЗ ЦЕНЫ
// =========================================================================
// Фасовка из наименования: граммы → вес, мл/л → объём (граммы неизвестны).
const packOf = (title) => {
  const gram = title.match(/(\d+(?:[.,]\d+)?)\s*(?:г|гр|грамм)\.?(?![а-я])/i);
  if (gram) {
    const weightG = Math.round(Number(gram[1].replace(',', '.')));
    return { weightG, label: `${gram[1].replace('.', ',')} г` };
  }
  const volume = title.match(/(\d+(?:[.,]\d+)?)\s*(мл|л)\.?(?![а-я])/i);
  if (volume) {
    const value = volume[1].replace('.', ',');
    return { weightG: 0, label: `${value} ${volume[2].toLowerCase()}` };
  }
  return { weightG: 0, label: 'За штуку' };
};

// Снятые плиток KREOLA из презентации производителя соответствуют кодам по составу и весу 60 г.
const KREOLA_PHOTO = {
  'НФ-00000301': 'kreola-dark-classic',
  'НФ-00000302': 'kreola-dark-hazelnut-cranberry',
  'НФ-00000297': 'kreola-milk-classic',
  'НФ-00000298': 'kreola-milk-walnut-cranberry',
  'НФ-00000299': 'kreola-milk-nuts',
  'НФ-00000295': 'kreola-white-classic',
  'НФ-00000296': 'kreola-white-cashew',
};

// В прайсе у сыра 24 мес. фото 36 мес., у оливок без косточки — CON HUESO.
const REJECTED_PRICE_PHOTOS = new Set(['НФ-00000112', 'НФ-00000228']);

const items = rows.map((row) => {
  const category = row.group === 'Сладкие дополнения' && KREOLA_CODES.has(row.code) ? 'chocolate' : CATEGORY_BY_PRICE[row.group];
  if (!category) throw new Error(`Строка ${row.row}: неизвестная группа прайса «${row.group}»`);
  const price = row.price === null || row.price === undefined ? null : Number(row.price);
  if (price !== null && !Number.isSafeInteger(price)) throw new Error(`Нецелая цена в строке ${row.row}: ${row.price}`);
  const title = typography(row.title);
  const id = row.code ? `nf-${row.code.replace(/^НФ-?/i, '')}` : `${category}-${agingOf(title) ?? slugify(title)}`;
  const supplierPhoto = supplierPhotos.photos[id];
  return {
    id,
    code: row.code ?? '',
    category,
    title,
    description: typography(row.note ?? ''),
    price,
    image: supplierPhoto?.image ?? (KREOLA_PHOTO[row.code] ? `brand/${KREOLA_PHOTO[row.code]}.webp` : row.media && !REJECTED_PRICE_PHOTOS.has(row.code) ? `img/${id}.webp` : null),
    imageCaption: supplierPhoto?.caption,
  };
});

for (const item of items) {
  if (!item.image) continue;
  const meta = await sharp(path.join(import.meta.dirname, '..', 'public', item.image)).metadata();
  item.imageW = meta.width;
  item.imageH = meta.height;
}

const products = [];
const previews = [];
for (const item of items) {
  const base = { id: item.id, code: item.code, title: item.title, category: item.category,
    agingMonths: agingOf(item.title), description: item.description, image: item.image, imageW: item.imageW ?? null, imageH: item.imageH ?? null,
    ...(item.imageCaption ? { imageCaption: item.imageCaption } : {}) };
  if (item.price === null) { previews.push(base); continue; }
  if (item.category === 'piece') {
    products.push({ ...base, kind: 'piece', pricePerKg: item.price, pieces: [], packs: [], bulk: null });
    continue;
  }
  const pack = packOf(item.title);
  products.push({ ...base, kind: 'pack', pricePerKg: pack.weightG ? Math.round(item.price * 1000 / pack.weightG) : 0,
    pieces: [], packs: [{ label: pack.label, weightG: pack.weightG, price: item.price }], bulk: null });
}

const known = new Map([...products, ...previews].map((item) => [item.id, item]));
if (known.size !== products.length + previews.length) throw new Error('Дубликаты id в каталоге');
for (const entry of [...products, ...previews]) {
  if (!CATEGORIES.some((category) => category.cat === entry.category)) throw new Error(`Группа «${entry.category}» не описана в структуре витрины`);
}
for (const kit of KITS) for (const component of kit.items) {
  const product = known.get(component.productId);
  const pack = product?.packs[component.packIdx];
  if (!pack || product.kind !== 'pack' || pack.price <= 0) throw new Error(`Набор «${kit.id}»: товар ${component.productId} без цены или без такой фасовки`);
}
const byCategory = (list) => list.reduce((acc, item) => ({ ...acc, [item.category]: (acc[item.category] ?? 0) + 1 }), {});
console.log('строк прайса:', rows.length, '| с ценой:', products.length, '| без цены:', previews.length,
  '| с фото:', [...products, ...previews].filter((item) => item.image).length);
console.log('категории:', byCategory(products), byCategory(previews));

fs.writeFileSync(path.join(import.meta.dirname, '..', 'lib', 'catalog.json'),
  JSON.stringify({ categories: CATEGORIES, kits: KITS, products, previews }, null, 2));
console.log('lib/catalog.json записан');
