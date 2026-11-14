'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useCart, formatRub } from './CartContext';
import type { Product } from '@/lib/types';
import { KITS, type CatalogKit } from '@/lib/products';
import { flyTokenToCart } from './Animations';
import { ChoicePhotos } from './BuyerChoices';
import { revealProps, revealInto } from '@/lib/reveal';

export function resolveKit(products: Product[], items: CatalogKit['items']) {
  const resolved = items.map((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    const pack = product?.packs[item.packIdx];
    return product && product.kind === 'pack' && pack && pack.price > 0 ? { product, pack, packIdx: item.packIdx } : null;
  });
  if (!resolved.length || resolved.some((item) => item === null)) return null;
  return resolved.filter((item): item is NonNullable<typeof item> => item !== null);
}

export default function Scenarios({ products }: { products: Product[] }) {
  const { addLines } = useCart();
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const kits = KITS.map((kit) => ({ ...kit, resolved: resolveKit(products, kit.items) })).filter((kit) => kit.resolved !== null);

  function add(kit: (typeof kits)[number]) {
    if (!kit.resolved) return;
    const success = addLines(kit.resolved.map(({ product, pack, packIdx }) => ({
      productId: product.id, title: product.title, label: pack.label, price: pack.price,
      weightG: pack.weightG, requiresWeightCheck: false, pieceId1c: null, kind: 'pack', packIdx, qty: 1,
    })));
    setFeedback((previous) => ({ ...previous, [kit.id]: success
      ? 'Весь набор добавлен в корзину.'
      : 'Набор не добавлен: достигнут лимит корзины. Уменьшите количество товаров и попробуйте снова.' }));
    const button = buttons.current[kit.id];
    if (success && button) flyTokenToCart(button.getBoundingClientRect(), 'ham');
  }

  return <section className="section"><div className="container">
    <div className="section-head" {...revealInto('mask')}><h2 className="section-title">Для себя, к столу и на подарок</h2><p className="section-subtitle">Примеры подборок из лавки. Состав выбираем под ваш вкус и повод.</p></div>
    <ChoicePhotos />
    <div className="section-head catalog-kits-heading" {...revealInto('mask')}><h3 className="checkout-title">Готовые наборы из каталога</h3><p className="checkout-hint">Фотографии выше — примеры выбора, а не фиксированный состав этих наборов. Состав и цены наборов указаны ниже.</p></div>
    {kits.length ? <div className="scenarios-grid">{kits.map((kit) => <article className="scenario-card" key={kit.id} {...revealProps}>
      <p className="scenario-label">{kit.label}</p><h4 className="scenario-name">{kit.title}</h4><p className="card-desc">{kit.description}</p>
      <ul className="scenario-list">{kit.resolved!.map(({ product, pack }) => <li key={product.id}><span>{product.title}<small>{pack.label}</small></span><span className="tabular">{formatRub(pack.price)}</span></li>)}</ul>
      <div className="scenario-total-row"><span>Стоимость товаров</span><strong className="scenario-total tabular">{formatRub(kit.resolved!.reduce((sum, item) => sum + item.pack.price, 0))}</strong></div>
      <button ref={(element) => { buttons.current[kit.id] = element; }} type="button" className="btn-primary" onClick={() => add(kit)}>Добавить весь набор</button>
      <p className="card-feedback" role="status">{feedback[kit.id] ?? ''}</p>
    </article>)}</div> : <div className="cart-empty-state"><h3>Наборы пока недоступны</h3><p>Выберите отдельные деликатесы из актуального каталога.</p><Link href="/catalog" className="btn-primary">Выбрать в каталоге</Link></div>}
  </div></section>;
}
