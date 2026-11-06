'use client';

import { useState } from 'react';
import { Product } from '@/lib/types';
import { useCart, formatRub, formatWeightLabel } from './CartContext';
import { runPig, bounceOlives } from './Animations';

// Тёмный терминал «Как считаем вес»: ползунок с магнитом к реальным весам кусков,
// переключатель продуктов, добавление порции в корзину.
export default function ScaleTerminal({ products }: { products: Product[] }) {
  const { addLine } = useCart();
  const hamon = products.find((p) => p.id === 'hamon-16-piece');
  const olives = products.find((p) => p.id === 'olives-gordal');

  const [mode, setMode] = useState<'hamon' | 'olives'>('hamon');
  const [weight, setWeight] = useState(230);
  const [added, setAdded] = useState(false);

  const cfg = mode === 'hamon'
    ? { product: hamon!, pricePerKg: hamon!.pricePerKg, min: 180, max: 420, step: 1, snap: [230, 300, 380], label: 'Хамон «16», 16 мес',
        hint: 'Как на весах при приёмке: тяните ползунок - цена пересчитывается до рубля', chips: [230, 300, 380] }
    : { product: olives!, pricePerKg: olives!.bulk!.pricePerKg, min: olives!.bulk!.minG, max: olives!.bulk!.maxG, step: olives!.bulk!.stepG, snap: [350], label: 'Оливки Gordal на развес',
        hint: 'Шаг 50\u00A0г. Фактический вес уточним на весах при фасовке (допуск ±15\u00A0г)', chips: [300, 350, 500] };

  const snapped = cfg.snap.reduce((acc, sp) => (Math.abs(weight - sp) <= 7 ? sp : acc), weight);
  const price = Math.round((snapped / 1000) * cfg.pricePerKg);

  function setW(raw: number) {
    let w = raw;
    for (const sp of cfg.snap) {
      if (Math.abs(w - sp) <= 7) { w = sp; break; }
    }
    setWeight(w);
  }

  function addToCart() {
    if (!cfg.product) return;
    addLine({
      productId: cfg.product.id,
      title: cfg.product.title,
      label: mode === 'hamon' ? `Отрез ~${formatWeightLabel(snapped)}` : `На развес ${formatWeightLabel(snapped)}`,
      price,
      weightG: snapped,
      requiresWeightCheck: true,
      pieceId1c: null,
      kind: mode === 'hamon' ? 'custom' : 'bulk',
      qty: 1,
    });
    if (mode === 'olives') bounceOlives(document.querySelector('.scale-stage'));
    else runPig();
    setAdded(true);
    setTimeout(() => setAdded(false), 900);
  }

  return (
    <section id="weight-system" className="section-dark">
      <div className="container">
        <div className="section-head">
          <h2 className="section-title">Как считаем вес куска</h2>
          <p className="section-subtitle">
            Все куски хамона приходят разного веса. Мы взвешиваем каждый кусок при приёмке и заносим в учётную систему, поэтому цена считается по фактическому весу до рубля.
          </p>
        </div>
        <div className="scale-bento">
          <div className="scale-panel">
            <div className="scale-switch" role="group" aria-label="Выбор продукта для расчёта">
              <button type="button" className="scale-switch-btn" aria-pressed={mode === 'hamon'} onClick={() => { setMode('hamon'); setWeight(230); }}>
                Хамон «16», 16 мес
              </button>
              <button type="button" className="scale-switch-btn" aria-pressed={mode === 'olives'} onClick={() => { setMode('olives'); setWeight(350); }}>
                Оливки Gordal на развес
              </button>
            </div>
            <div className="scale-readout tabular" aria-live="polite">
              <div className="readout-cell">
                <span className="readout-label">Вес</span>
                <span className="readout-digits">{formatWeightLabel(snapped)}</span>
              </div>
              <div className="readout-cell">
                <span className="readout-label">Цена за 1 кг</span>
                <span className="readout-digits">{formatRub(cfg.pricePerKg)}</span>
              </div>
              <div className="readout-cell">
                <span className="readout-label">Итого</span>
                <span className="readout-digits highlight">{formatRub(price)}</span>
              </div>
            </div>
            <div>
              <label className="scale-range-label" htmlFor="scale-range">{cfg.hint}</label>
              <input
                id="scale-range"
                type="range"
                min={cfg.min}
                max={cfg.max}
                step={cfg.step}
                value={weight}
                onChange={(e) => setW(parseInt(e.target.value, 10))}
              />
            </div>
            <div className="magnet-chips" role="group" aria-label="Быстрый выбор веса">
              {cfg.chips.map((w) => (
                <button key={w} type="button" className="magnet-btn tabular" aria-pressed={snapped === w} onClick={() => setW(w)}>
                  Порция {w}{'\u00A0'}г
                </button>
              ))}
            </div>
            <button type="button" className="scale-add-btn" onClick={addToCart}>
              {added ? 'Добавлено в корзину' : 'Добавить порцию в корзину'}
            </button>
          </div>
          <div className="scale-panel scale-info-panel">
            <h3>Почему оплата куска проходит в два шага</h3>
            <p>1. Вы выбираете конкретный кусок по весу и отправляете заказ без регистрации.</p>
            <p>2. Мы находим именно этот кусок на Сытном рынке, проверяем вакуумную упаковку и подтверждаем вес.</p>
            <p>3. Приходит ссылка на оплату точной суммы в Telegram, WhatsApp или SMS - как удобнее.</p>
            <div className="scale-info-foot">Для фиксированной нарезки, банок оливок и сыров оплата открывается сразу при оформлении.</div>
          </div>
        </div>
      </div>
    </section>
  );
}
