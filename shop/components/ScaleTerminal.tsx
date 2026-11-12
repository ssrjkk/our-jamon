'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Product } from '@/lib/types';
import { useCart, formatRub, formatWeightLabel } from './CartContext';
import { weightPriceOf } from '@/lib/price';
import { flyTokenToCart } from './Animations';

export default function ScaleTerminal({ products, requestedWeightG }: { products: Product[]; requestedWeightG?: number }) {
  const { addLine } = useCart();
  const params = useSearchParams();
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const eligible = products.filter((product) =>
    (product.kind === 'piece' && product.category === 'piece') ||
    (product.kind === 'pack' && Boolean(product.bulk)),
  );
  const initial = eligible.find((product) => product.id === (params.get('productId') ?? params.get('product'))) ?? eligible.find((product) => product.id === 'nf-00000213') ?? eligible[0];
  const [productId, setProductId] = useState(initial?.id ?? '');
  const product = eligible.find((entry) => entry.id === productId) ?? initial;
  const queryWeight = Number(params.get('weightG') ?? params.get('weight'));
  const requested = requestedWeightG ?? queryWeight;
  const [weight, setWeight] = useState(String(requested > 0 && Number.isFinite(requested) ? requested : initial?.bulk?.minG ?? 300));
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (requested > 0 && Number.isFinite(requested)) setWeight(String(requested));
  }, [requested]);
  useEffect(() => {
    const requestedProduct = params.get('productId') ?? params.get('product');
    if (requestedProduct) setProductId(requestedProduct);
  }, [params]);

  const weightG = Number(weight);
  const bulk = product?.kind === 'pack' ? product.bulk : null;
  const min = bulk?.minG ?? 50;
  const max = bulk?.maxG ?? 2000;
  const step = bulk?.stepG ?? 1;
  const valid = Number.isSafeInteger(weightG) && weightG >= min && weightG <= max && (weightG - min) % step === 0;
  const rate = bulk?.pricePerKg ?? product?.pricePerKg ?? 0;
  const price = weightPriceOf(weightG, rate);

  function choose(next: Product) {
    setProductId(next.id);
    setWeight(String(next.bulk?.minG ?? 300));
    setFeedback('');
  }
  function add() {
    if (!product || !valid) return;
    const added = addLine({ productId: product.id, title: product.title, label: `${bulk ? 'На развес' : 'Отрез'} ${formatWeightLabel(weightG)}`, price, weightG, requiresWeightCheck: true, pieceId1c: null, kind: bulk ? 'bulk' : 'custom', qty: 1 });
    setFeedback(added ? 'Порция добавлена в корзину. Точный вес подтвердим перед оплатой.' : 'Достигнуто максимальное количество. Проверьте корзину.');
    if (added && buttonRef.current) flyTokenToCart(buttonRef.current.getBoundingClientRect(), product.category === 'olives' ? 'olive' : 'ham');
  }

  return <section className="section-dark"><div className="container">
    <div className="section-head"><h2 className="section-title">Граммы, а не догадки</h2><p className="section-subtitle">Укажите желаемый вес — увидите предварительную сумму. При сборке взвесим порцию и согласуем точную стоимость перед оплатой.</p></div>
    {product ? <div className="scale-bento"><div className="scale-panel">
      <div className="form-field"><label htmlFor={`${id}-product`}>Что взвешиваем</label><select className="form-input" id={`${id}-product`} value={product.id} onChange={(event) => { const next = eligible.find((entry) => entry.id === event.target.value); if (next) choose(next); }}>{eligible.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}{entry.bulk ? ' · на развес' : ''}</option>)}</select></div>
      <div className="scale-readout tabular"><div className="readout-cell"><span className="readout-label">Желаемый вес</span><strong className="readout-digits">{valid ? formatWeightLabel(weightG) : '—'}</strong></div><div className="readout-cell"><span className="readout-label">Цена за кг</span><strong className="readout-digits">{formatRub(rate)}</strong></div><div className="readout-cell"><span className="readout-label">Предварительно</span><strong className="readout-digits highlight">{valid ? formatRub(price) : '—'}</strong></div></div>
      <div className="scale-weight-field"><label htmlFor={`${id}-weight`}>Желаемый вес, г</label><input id={`${id}-weight`} className="form-input tabular" type="number" inputMode="numeric" min={min} max={max} step={step} value={weight} aria-invalid={!valid} aria-describedby={`${id}-hint`} onChange={(event) => { setWeight(event.target.value); setFeedback(''); }} /></div>
      <input type="range" min={min} max={max} step={step} value={valid ? weightG : min} aria-label="Желаемый вес порции в граммах" onChange={(event) => { setWeight(event.target.value); setFeedback(''); }} />
      <p id={`${id}-hint`} className="scale-range-label">{bulk ? `От ${min} до ${max} г, шаг ${step} г.` : 'Без округления к соседнему куску: в заказ уйдёт указанный вами вес.'}{!valid && ` Укажите целый вес от ${min} до ${max} г${step > 1 ? ` с шагом ${step} г` : ''}.`}</p>
      <div className="magnet-chips" role="group" aria-label="Быстрый выбор веса">{[100, 300, 500].filter((value) => value >= min && value <= max && (value - min) % step === 0).map((value) => <button type="button" className="magnet-btn tabular" key={value} aria-pressed={weightG === value} onClick={() => { setWeight(String(value)); setFeedback(''); }}>{value} г</button>)}</div>
      <button ref={buttonRef} type="button" className="scale-add-btn" disabled={!valid} onClick={add}>Добавить порцию в корзину</button><p className="card-feedback" role="status">{feedback}</p>
    </div><div className="scale-panel scale-info-panel"><h3>Сначала вес.<br />Потом оплата.</h3><ol><li>Указываете желаемый вес отреза — от 50 до 2 000 г.</li><li>Мы проверяем наличие, взвешиваем и подтверждаем сумму заказа и доставки.</li><li>После подтверждения оплачиваете заказ по ссылке.</li></ol><p className="scale-info-foot">У фасовок цена фиксирована. У целых ног с ценой за штуку она не меняется после взвешивания.</p></div></div> : <div className="scale-panel"><h3>Весовые товары сейчас недоступны</h3><p>В актуальном каталоге нет отрезов и порций на развес. Выберите готовую фасовку.</p><Link href="/catalog" className="scale-add-btn">Открыть каталог</Link></div>}
  </div></section>;
}
