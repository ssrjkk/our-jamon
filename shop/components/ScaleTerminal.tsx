'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Product } from '@/lib/types';
import { useCart, formatRub, formatWeightLabel } from './CartContext';
import { weightPriceOf, formatGrams, CUT_WEIGHT_MIN_G, CUT_WEIGHT_MAX_G } from '@/lib/price';
import { flyTokenToCart } from './Animations';
import { popElement } from './Motion';
import { revealProps, revealInto } from '@/lib/reveal';

// Дуга рисуется вокруг стрелочного центра (100,88) тем же сектором, что и стрелка:
// ±60° от вертикали. Радиус 58 даёт точки (49.8,59) и (150.2,59). Разделитель —
// запятая: тот же конвейер, что минифицирует path, и гейт типографики чисел
// различает «200,100» и «200 100», где второе — переносимый пробел.
const ARC = 'M49.8,59A58,58,0,0,1,150.2,59';
const ARC_TICKS = [-60, -30, 0, 30, 60];

export default function ScaleTerminal({ products, requestedWeightG }: { products: Product[]; requestedWeightG?: number }) {
  const { addLine } = useCart();
  const params = useSearchParams();
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const priceRef = useRef<HTMLElement>(null);
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
  const min = bulk?.minG ?? CUT_WEIGHT_MIN_G;
  const max = bulk?.maxG ?? CUT_WEIGHT_MAX_G;
  const step = bulk?.stepG ?? 1;
  const valid = Number.isSafeInteger(weightG) && weightG >= min && weightG <= max && (weightG - min) % step === 0;
  const rate = bulk?.pricePerKg ?? product?.pricePerKg ?? 0;
  const price = weightPriceOf(weightG, rate);
  // Стрелка идёт по тем же границам, что ползунок, и упирается в них при невалидном
  // вводе: зашкалившая стрелка честнее, чем пустая шкала без объяснения.
  const share = max > min ? (Math.min(max, Math.max(min, Number.isFinite(weightG) ? weightG : min)) - min) / (max - min) : 0;
  const dialStyle = { '--needle': `${(-60 + share * 120).toFixed(2)}deg`, '--gauge-fill': (share * 100).toFixed(2) } as CSSProperties;

  function commit(next: number, origin?: HTMLElement) {
    setWeight(String(next));
    setFeedback('');
    popElement(priceRef.current);
    if (origin) popElement(origin);
  }
  function choose(next: Product) {
    setProductId(next.id);
    setWeight(String(next.bulk?.minG ?? 300));
    setFeedback('');
    popElement(priceRef.current);
  }
  function add() {
    if (!product || !valid) return;
    const added = addLine({ productId: product.id, title: product.title, label: `${bulk ? 'На развес' : 'Отрез'} ${formatWeightLabel(weightG)}`, price, weightG, requiresWeightCheck: true, pieceId1c: null, kind: bulk ? 'bulk' : 'custom', qty: 1 });
    setFeedback(added ? 'Порция добавлена в корзину. Точный вес подтвердим перед оплатой.' : 'Достигнуто максимальное количество. Проверьте корзину.');
    if (added && buttonRef.current) flyTokenToCart(buttonRef.current.getBoundingClientRect(), product.category === 'olives' ? 'olive' : 'ham');
  }

  return <section className="section-dark"><div className="container">
    <div className="section-head" {...revealInto('mask')}><h2 className="section-title">Граммы, а не догадки</h2><p className="section-subtitle">Укажите желаемый вес — увидите предварительную сумму. При сборке взвесим порцию и согласуем точную стоимость перед оплатой.</p></div>
    {product ? <div className="scale-bento"><div className="scale-panel" {...revealProps}>
      <div className="form-field"><label htmlFor={`${id}-product`}>Что взвешиваем</label><select className="form-input" id={`${id}-product`} value={product.id} onChange={(event) => { const next = eligible.find((entry) => entry.id === event.target.value); if (next) choose(next); }}>{eligible.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}{entry.bulk ? ' · на развес' : ''}</option>)}</select></div>
      <div className="scale-readout tabular"><div className="readout-cell"><span className="readout-label">Желаемый вес</span><strong className="readout-digits">{valid ? formatWeightLabel(weightG) : '—'}</strong></div><div className="readout-cell"><span className="readout-label">Цена за кг</span><strong className="readout-digits">{formatRub(rate)}</strong></div><div className="readout-cell"><span className="readout-label">Предварительно</span><strong className="readout-digits highlight" ref={priceRef}>{valid ? formatRub(price) : '—'}</strong></div></div>
      <div className="scale-gauge" aria-hidden="true" style={dialStyle}>
        <svg className="gauge-dial" viewBox="0,0,200,100" role="presentation" focusable="false">
          <path className="gauge-track" d={ARC} pathLength={100} />
          <path className="gauge-arc" d={ARC} pathLength={100} />
          {ARC_TICKS.map((angle) => <line className="gauge-tick" key={angle} x1="100" y1="42" x2="100" y2="36" transform={`rotate(${angle},100,88)`} />)}
          <g className="gauge-needle">
            <line className="gauge-stem" x1="100" y1="88" x2="100" y2="46" />
            <circle className="gauge-hub" cx="100" cy="88" r="5" />
          </g>
        </svg>
        <p className="gauge-caption"><span>{formatGrams(min)}</span><span>{formatGrams(max)}</span></p>
      </div>
      <div className="scale-weight-field"><label htmlFor={`${id}-weight`}>Желаемый вес, г</label><input id={`${id}-weight`} className="form-input tabular" type="number" inputMode="numeric" min={min} max={max} step={step} value={weight} aria-invalid={!valid} aria-describedby={`${id}-hint`} onChange={(event) => { setWeight(event.target.value); setFeedback(''); }} /></div>
      <input type="range" min={min} max={max} step={step} value={valid ? weightG : min} aria-label="Желаемый вес порции в граммах" onChange={(event) => { setWeight(event.target.value); setFeedback(''); }} />
      <p id={`${id}-hint`} className="scale-range-label">{bulk ? `От ${min} до ${formatGrams(max)}, шаг ${formatGrams(step)}.` : 'Без округления к соседнему куску: в заказ уйдёт указанный вами вес.'}{!valid && ` Укажите целый вес от ${min} до ${formatGrams(max)}${step > 1 ? ` с шагом ${formatGrams(step)}` : ''}.`}</p>
      <div className="magnet-chips" role="group" aria-label="Быстрый выбор веса">{[100, 300, 500].filter((value) => value >= min && value <= max && (value - min) % step === 0).map((value) => <button type="button" className="magnet-btn tabular" key={value} aria-pressed={weightG === value} onClick={(event) => commit(value, event.currentTarget)}>{formatGrams(value)}</button>)}</div>
      <button ref={buttonRef} type="button" className="scale-add-btn" disabled={!valid} onClick={add}>Добавить порцию в корзину</button><p className="card-feedback" role="status">{feedback}</p>
    </div><div className="scale-panel scale-info-panel" {...revealProps}><h3>Сначала вес.<br />Потом оплата.</h3><ol><li>Указываете желаемый вес отреза — от {min} до {formatGrams(max)}.</li><li>Мы проверяем наличие, взвешиваем и подтверждаем сумму заказа и доставки.</li><li>После подтверждения оплачиваете заказ по ссылке.</li></ol><p className="scale-info-foot">У фасовок цена фиксирована. У целых ног с ценой за штуку она не меняется после взвешивания.</p></div></div> : <div className="scale-panel"><h3>Весовые товары сейчас недоступны</h3><p>В актуальном каталоге нет отрезов и порций на развес. Выберите готовую фасовку.</p><Link href="/catalog" className="scale-add-btn">Открыть каталог</Link></div>}
  </div></section>;
}
