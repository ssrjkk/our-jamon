import type { ReactNode } from 'react';
import type { Product } from '@/lib/types';
import { CATEGORY_TITLES } from '@/lib/products';

export interface Media {
  title: string;
  category: Product['category'];
  agingMonths: number | null;
  imageUrl?: string;
  imageCaption?: string;
  imageW?: number;
  imageH?: number;
}

/** Фото из прайса, если оно есть; иначе — редакционная этикетка. */
export function ProductArt({ product }: { product: Media }) {
  if (product.imageUrl) {
    return (
      <>
        <div className="product-photo">
          <img src={product.imageUrl} alt={product.title} width={product.imageW ?? 560} height={product.imageH ?? 560} style={product.imageW ? { maxWidth: `${product.imageW}px` } : undefined} loading="lazy" decoding="async" />
        </div>
        {product.imageCaption && <p className="product-photo-note">{product.imageCaption}</p>}
      </>
    );
  }
  const aged = Boolean(product.agingMonths && product.agingMonths > 0);
  return (
    <div className={'product-art' + (aged ? ' is-aged' : '')} aria-hidden="true">
      <span className="art-category">{CATEGORY_TITLES[product.category]?.title ?? product.category}</span>
      {aged ? <div className="aging-mark"><strong>{product.agingMonths}</strong><span>месяцев<br />выдержки</span></div>
        : <div className="art-word">{product.category === 'extras' ? 'Культура\nнарезки' : product.category === 'olives' ? 'К столу' : product.category === 'sliced' ? 'Тонкий\nсрез' : product.category === 'certificate' ? 'В подарок' : 'Хорошая\nкомпания'}</div>}
    </div>
  );
}

/**
 * Кольца историй — реальные снимки лавки. Кадр шторки и пузырёк ленты сняты с одного файла,
 * но слоты у них разные: пузырёк 62 CSS-пикселя на всех экранах, кадр — 296 на мобайле
 * (592 device-пикселя) и 390 на остальном. Лента поэтому получает 180-пиксельный знак,
 * а шторка — список вариантов, из которого браузер берёт 400 на десктопе и полный кадр на
 * мобильной сетке. Без этого главная отдавала ~1 МБ пяти снимков под слот в 62 пикселя.
 * Порядок атрибутов держит `src` первым: гейт паритета читает картинку кольца по нему.
 */
const КАДР_SIZES = '(max-width: 520px) 92vw, 390px';

export const STORY_ART: Record<string, ReactNode> = {
  cut: <img src="/brand/hero-slicing.webp" srcSet="/brand/hero-slicing-180.webp 180w, /brand/hero-slicing-400.webp 400w, /brand/hero-slicing.webp 1314w" sizes={КАДР_SIZES} alt="" width="1314" height="1230" decoding="async" />,
  evening: <img src="/brand/choice-table-1.webp" srcSet="/brand/choice-table-1-180.webp 180w, /brand/choice-table-1-400.webp 400w, /brand/choice-table-1.webp 720w" sizes={КАДР_SIZES} alt="" width="720" height="1280" loading="lazy" decoding="async" />,
  weigh: <img src="/brand/choice-self.webp" srcSet="/brand/choice-self-180.webp 180w, /brand/choice-self-400.webp 400w, /brand/choice-self.webp 720w" sizes={КАДР_SIZES} alt="" width="720" height="1280" loading="lazy" decoding="async" />,
  aging: <img src="/brand/choice-gift.webp" srcSet="/brand/choice-gift-180.webp 180w, /brand/choice-gift-400.webp 400w, /brand/choice-gift.webp 720w" sizes={КАДР_SIZES} alt="" width="720" height="1280" loading="lazy" decoding="async" />,
  shop: <img src="/brand/shop-interior.webp" srcSet="/brand/shop-interior-180.webp 180w, /brand/shop-interior-400.webp 400w, /brand/shop-interior.webp 720w" sizes={КАДР_SIZES} alt="" width="720" height="1280" loading="lazy" decoding="async" />,
};

/** Знак пузырька: тот же сюжет, но размером со слот — лента не тянет полный кадр. */
export const STORY_ART_THUMB: Record<string, { src: string; w: number; h: number }> = {
  cut: { src: '/brand/hero-slicing-180.webp', w: 180, h: 168 },
  evening: { src: '/brand/choice-table-1-180.webp', w: 180, h: 320 },
  weigh: { src: '/brand/choice-self-180.webp', w: 180, h: 320 },
  aging: { src: '/brand/choice-gift-180.webp', w: 180, h: 320 },
  shop: { src: '/brand/shop-interior-180.webp', w: 180, h: 320 },
};
