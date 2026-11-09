import type { ReactNode } from 'react';
import type { Product } from '@/lib/types';
import { CATEGORY_TITLES } from '@/lib/products';

export interface Media {
  title: string;
  category: Product['category'];
  agingMonths: number | null;
  imageUrl?: string;
  imageW?: number;
  imageH?: number;
}

/** Фото из прайса, если оно есть; иначе — редакционная этикетка. */
export function ProductArt({ product }: { product: Media }) {
  if (product.imageUrl) {
    return (
      <div className="product-photo">
        <img src={product.imageUrl} alt={product.title} width={product.imageW ?? 560} height={product.imageH ?? 560} style={product.imageW ? { maxWidth: `${product.imageW}px` } : undefined} loading="lazy" decoding="async" />
      </div>
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

export const STORY_ART: Record<string, ReactNode> = {
  cut: <span className="story-monogram">Х</span>,
  evening: <span className="story-monogram italic">к столу</span>,
  weigh: <span className="story-monogram">г</span>,
  aging: <span className="story-monogram italic">время</span>,
  shop: <img src="/brand/logo-stacked.svg" alt="" width="160" height="130" />,
};
