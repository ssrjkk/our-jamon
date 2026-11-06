'use client';

import { useRef, useState } from 'react';
import { useCart, formatRub } from './CartContext';
import { Product } from '@/lib/types';
import { runPig, flyTokenToCart } from './Animations';

// Сценарии лавки: «для себя, к столу и на подарок».
// Хамон - главный герой, вокруг него собираем вкусы (идея Виталия).
// Каждая карточка собирается в корзину одним кликом.

interface Scenario {
  id: string;
  label: string;
  name: string;
  line: string;
  items: { productId: string; packIdx?: number }[];
  total: number;
}

export default function Scenarios({ products }: { products: Product[] }) {
  const { addLine } = useCart();
  const [doneId, setDoneId] = useState<string | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Цены считаем из живого каталога
  const priceOf = (productId: string, packIdx?: number) => {
    const p = products.find((x) => x.id === productId);
    const pack = p?.packs[packIdx ?? 0];
    return pack ? pack.price : 0;
  };
  const nameOf = (productId: string) => products.find((x) => x.id === productId)?.title || '';

  const scenarios: Scenario[] = [
    {
      id: 'self',
      label: 'Для себя',
      name: 'Познакомиться с хамоном',
      line: 'Три выдержки в одной коробке - найдёте свою.',
      items: [{ productId: 'hamon-tasting-sliced' }],
      total: priceOf('hamon-tasting-sliced'),
    },
    {
      id: 'table',
      label: 'К столу',
      name: 'Вкусный вечер',
      line: 'Нарезка «22», крупные оливки и гриссини к бокалу.',
      items: [
        { productId: 'hamon-sliced-22', packIdx: 0 },
        { productId: 'olives-gordal', packIdx: 0 },
        { productId: 'grissini', packIdx: 0 },
      ],
      total: priceOf('hamon-sliced-22', 0) + priceOf('olives-gordal', 0) + priceOf('grissini', 0),
    },
    {
      id: 'gift',
      label: 'На подарок',
      name: 'Бокс «В подарок»',
      line: 'Соберём и упакуем - останется подписать открытку.',
      items: [
        { productId: 'hamon-sliced-22', packIdx: 1 },
        { productId: 'olives-manzanilla', packIdx: 0 },
        { productId: 'cheese-manchego', packIdx: 0 },
      ],
      total: priceOf('hamon-sliced-22', 1) + priceOf('olives-manzanilla', 0) + priceOf('cheese-manchego', 0),
    },
  ];

  function add(scenario: Scenario) {
    for (const item of scenario.items) {
      const product = products.find((x) => x.id === item.productId);
      const pack = product?.packs[item.packIdx ?? 0];
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
        packIdx: item.packIdx ?? 0,
        qty: 1,
      });
    }
    const btn = btnRefs.current[scenario.id];
    if (btn) flyTokenToCart(btn.getBoundingClientRect(), 'ham');
    runPig();
    setDoneId(scenario.id);
    setTimeout(() => setDoneId(null), 1200);
  }

  return (
    <section id="scenarios" className="section" style={{ borderTop: 'none' }}>
      <div className="container">
        <div className="section-head">
          <h2 className="section-title">Три сценария — выберите свой</h2>
          <p className="section-subtitle">Хамон — главный герой. Вкусы собираем вокруг него: для себя, к столу и на подарок.</p>
        </div>
        <div className="scenarios-grid">
          {scenarios.map((sc) => (
            <article key={sc.id} className="scenario-card">
              <div className="scenario-label">{sc.label}</div>
              <div className="scenario-name">{sc.name}</div>
              <p style={{ fontSize: '0.9375rem', color: 'var(--graphite-muted)' }}>{sc.line}</p>
              <ul className="scenario-list">
                {sc.items.map((it, i) => (
                  <li key={i}>{nameOf(it.productId)}</li>
                ))}
              </ul>
              <div className="scenario-total-row">
                <span style={{ fontSize: '0.8125rem', color: 'var(--graphite-muted)' }}>Готовый набор</span>
                <span className="scenario-total tabular">{formatRub(sc.total)}</span>
              </div>
              <button
                type="button"
                ref={(el) => { btnRefs.current[sc.id] = el; }}
                className="btn-primary"
                style={{ width: '100%' }}
                onClick={() => add(sc)}
              >
                {doneId === sc.id ? 'Собрано в корзине' : 'Собрать сценарий'}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
