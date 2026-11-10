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

/** Кольца историй — реальные снимки лавки, те же файлы, что уже грузятся на странице. */
export const STORY_ART: Record<string, ReactNode> = {
  cut: <img src="/brand/hero-slicing.webp" alt="" width="1314" height="1230" decoding="async" />,
  evening: <img src="/brand/choice-table-1.webp" alt="" width="720" height="1280" loading="lazy" decoding="async" />,
  weigh: <img src="/brand/choice-self.webp" alt="" width="720" height="1280" loading="lazy" decoding="async" />,
  aging: <img src="/brand/choice-gift.webp" alt="" width="720" height="1280" loading="lazy" decoding="async" />,
  shop: <img src="/brand/shop-interior.webp" alt="" width="720" height="1280" loading="lazy" decoding="async" />,
};
