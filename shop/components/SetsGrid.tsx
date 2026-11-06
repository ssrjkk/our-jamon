'use client';

import { useRef, useState } from 'react';
import { SETS } from '@/lib/products';
import { Product } from '@/lib/types';
import { useCart, formatRub } from './CartContext';
import { runPig, flyTokenToCart } from './Animations';

// Секция наборов: готовые сочетания витрины, добавление всего набора в 1 клик.
export default function SetsGrid({ products }: { products: Product[] }) {
  const { addLine } = useCart();
  const [doneId, setDoneId] = useState<string | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function addSet(setId: string) {
    const set = SETS.find((s) => s.id === setId);
    if (!set) return;
    for (const c of set.components) {
      const product = products.find((p) => p.id === c.productId);
      const pack = product?.packs[c.optionIdx];
      if (!product || !pack) continue;
      addLine({
        productId: product.id,
        title: product.title,
        label: pack.label,
        price: pack.price,
        weightG: pack.weightG,
        requiresWeightCheck: false,
        pieceId1c: null,
        kind: 'pack',
        packIdx: c.optionIdx,
        qty: 1,
      });
    }
    const btn = btnRefs.current[setId];
    if (btn) flyTokenToCart(btn.getBoundingClientRect(), 'ham');
    runPig();
    setDoneId(setId);
    setTimeout(() => setDoneId(null), 1200);
  }

  return (
    <div className="sets-grid">
      {SETS.map((set) => {
        const rows = set.components.map((c) => {
          const p = products.find((x) => x.id === c.productId);
          const pack = p?.packs[c.optionIdx];
          return { name: p?.title || '', price: pack?.price || 0 };
        });
        const total = rows.reduce((acc, r) => acc + r.price, 0);
        return (
          <article key={set.id} className={'set-card' + (set.featured ? ' featured' : '')}>
            <div>
              <div className="set-kicker">{set.kicker}</div>
              <h3 className="set-title">{set.title}</h3>
              <p style={{ fontSize: '0.9375rem', color: 'var(--graphite-muted)', marginTop: 6 }}>{set.desc}</p>
            </div>
            <ul className="set-list">
              {rows.map((r, i) => (
                <li key={i}>
                  <span>{r.name}</span>
                  <span className="tabular" style={{ whiteSpace: 'nowrap' }}>{formatRub(r.price)}</span>
                </li>
              ))}
            </ul>
            <div className="set-total-row">
              <span style={{ fontSize: '0.8125rem', color: 'var(--graphite-muted)' }}>Набор целиком</span>
              <span className="set-total tabular">{formatRub(total)}</span>
            </div>
            <button
              type="button"
              ref={(el) => { btnRefs.current[set.id] = el; }}
              className="set-add-btn"
              onClick={() => addSet(set.id)}
            >
              {doneId === set.id ? 'Набор добавлен' : 'Добавить весь набор в корзину'}
            </button>
          </article>
        );
      })}
    </div>
  );
}
