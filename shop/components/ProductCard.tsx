'use client';

import { useMemo, useRef, useState } from 'react';
import { Product } from '@/lib/types';
import { useCart, formatRub, formatWeightLabel } from './CartContext';
import { ProductArt } from './Art';
import { runPig, flyTokenToCart, bounceOlives } from './Animations';

interface Props {
  product: Product;
  serverReservedPieceIds: string[];
}

// Карточка товара: выбор конкретного куска из 1С, фасовки, развес и «под заказ».
// Кусок уникален: резервируется в корзине и на сервере, второй раз добавить нельзя.
export default function ProductCard({ product, serverReservedPieceIds }: Props) {
  const { addLine, reservedPieceIds } = useCart();
  const [sel, setSel] = useState<string>(() => (product.kind === 'piece' ? 'avg' : 'pack-0'));
  const [bulkW, setBulkW] = useState<number>(product.bulk ? 350 : 0);
  const [added, setAdded] = useState(false);
  const [takenMsg, setTakenMsg] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const reserved = useMemo(
    () => new Set([...serverReservedPieceIds, ...reservedPieceIds]),
    [serverReservedPieceIds, reservedPieceIds],
  );

  const active = useMemo(() => {
    if (product.kind === 'piece') {
      // Решение Виталия: куски не выкладываем поштучно - средний вес, подтверждение при связи
      const weights = product.pieces.map((p) => p.weightG);
      const avgW = weights.length ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length) : 250;
      const legFixed = typeof product.pieces[0]?.price === 'number' ? product.pieces[0].price : null;
      if (sel === 'custom') {
        return {
          price: Math.round((avgW / 1000) * product.pricePerKg),
          caption: 'Ориентир - точный вес согласуем',
          canAdd: true,
          label: 'Индивидуальный отрез под заказ',
          weightG: avgW,
          pieceId1c: null,
          requiresWeightCheck: true,
        };
      }
      return {
        price: legFixed ?? Math.round((avgW / 1000) * product.pricePerKg),
        caption: legFixed !== null
          ? 'Фиксированная цена за ногу'
          : `Средний вес ${formatWeightLabel(avgW)} - подтвердим при связи`,
        canAdd: true,
        label: (product.category === 'leg' ? 'Нога ' : 'Кусок ') + formatWeightLabel(avgW),
        weightG: avgW,
        pieceId1c: null,
        requiresWeightCheck: true,
      };
    }
    if (sel === 'bulk' && product.bulk) {
      const w = Math.min(product.bulk.maxG, Math.max(product.bulk.minG, bulkW));
      return {
        price: Math.round((w / 1000) * product.bulk.pricePerKg),
        caption: `На развес ${w}\u00A0г`,
        canAdd: true,
        label: `На развес ${w}\u00A0г`,
        weightG: w,
        pieceId1c: null,
        requiresWeightCheck: true,
      };
    }
    const idx = sel.startsWith('pack-') ? parseInt(sel.slice(5), 10) : 0;
    const pack = product.packs[idx] || product.packs[0];
    return {
      price: pack.price,
      caption: pack.label,
      canAdd: true,
      label: pack.label,
      weightG: pack.weightG,
      pieceId1c: null,
      requiresWeightCheck: false,
    };
  }, [product, sel, bulkW]);

  function onAdd() {
    if (!active.canAdd) {
      setTakenMsg('Этот кусок уже в корзине - выберите другой вес.');
      return;
    }
    addLine({
      productId: product.id,
      title: product.title,
      label: active.label,
      price: active.price,
      weightG: active.weightG,
      requiresWeightCheck: active.requiresWeightCheck,
      pieceId1c: active.pieceId1c,
      kind: product.kind === 'piece' ? (sel === 'custom' ? 'custom' : 'custom') : sel === 'bulk' ? 'bulk' : 'pack',
      packIdx: sel.startsWith('pack-') ? parseInt(sel.slice(5), 10) : undefined,
      qty: 1,
    });
    // Фирменные анимации
    if (product.category === 'olives') {
      bounceOlives(stageRef.current);
      if (addBtnRef.current) flyTokenToCart(addBtnRef.current.getBoundingClientRect(), 'olive');
    } else if (['piece', 'leg', 'sliced'].includes(product.category)) {
      runPig();
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 900);
  }

  const meta = (product.country ? countryName(product.country) : '') + (product.agingMonths ? ` · Выдержка ${product.agingMonths}\u00A0мес.` : '');
  const per100 = Math.round(product.pricePerKg / 10);
  const isOlive = product.category === 'olives';

  return (
    <article className="product-card">
      <div>
        <div className="card-media">
          <ProductArt product={product} />
          <div className="olive-stage" ref={stageRef} aria-hidden="true" />
        </div>
        <div className="card-header-row">
          <h3 className="card-title">{product.title}</h3>
          <span className="rate-per-100">{product.category === 'extras'
            ? (product.id === 'gift-certificate' ? 'Подарочный фонд' : 'В наличии')
            : `${formatRub(per100)} / 100\u00A0г`}</span>
        </div>
        <div className="card-meta tabular">{meta}</div>
        <p className="card-desc">{product.description}</p>
      </div>

      <div className="selector-dynamic-slot">
        {product.kind === 'piece' ? (
          <>
            <div className="selector-caption">
              <span>{product.category === 'leg' ? 'Вес ноги (средний):' : 'Кусок (средний вес):'}</span>
            </div>
            <div className="options-wrap" role="radiogroup" aria-label="Вес">
              <button type="button" className="option-chip tabular" role="radio" aria-checked={sel !== 'custom'}>
                <span>{product.category === 'leg' ? 'Целая нога' : 'Кусок'}</span>
                <span className="chip-sub">
                  {typeof product.pieces[0]?.price === 'number'
                    ? formatRub(product.pieces[0].price)
                    : `~${formatWeightLabel(
                        product.pieces.length
                          ? Math.round(product.pieces.reduce((a, p) => a + p.weightG, 0) / product.pieces.length)
                          : 250,
                      )}`}
                </span>
              </button>
              {product.category === 'piece' && (
                <button
                  type="button"
                  className="option-chip"
                  role="radio"
                  aria-checked={sel === 'custom'}
                  onClick={() => setSel('custom')}
                >
                  <span>Отрез под заказ</span>
                  <span className="chip-sub">Свой вес</span>
                </button>
              )}
            </div>
            <div className="custom-cut-note">
              {sel === 'custom'
                ? 'Точный вес и сумму согласуем при сборке и пришлём ссылку на оплату.'
                : 'Кусок взвешен при приёмке. Подтвердим вес и остатки, когда свяжемся с вами по заказу.'}
            </div>
          </>
        ) : (
          <>
            <div className="selector-caption"><span>Выберите фасовку:</span></div>
            <div className="options-wrap" role="radiogroup" aria-label="Выбор фасовки">
              {product.packs.map((pk, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="option-chip tabular"
                  role="radio"
                  aria-checked={sel === 'pack-' + idx}
                  onClick={() => setSel('pack-' + idx)}
                >
                  <span>{pk.label}</span>
                  <span className="chip-sub">{formatRub(pk.price)}</span>
                </button>
              ))}
              {product.bulk && (
                <button
                  type="button"
                  className="option-chip"
                  role="radio"
                  aria-checked={sel === 'bulk'}
                  data-olive={isOlive}
                  onClick={() => setSel('bulk')}
                >
                  <span>На развес</span>
                  <span className="chip-sub">{product.bulk.minG}–{product.bulk.maxG}{'\u00A0'}г</span>
                </button>
              )}
            </div>
            {product.bulk && sel === 'bulk' && (
              <div className="bulk-slider-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                  <span>Вес порции: <strong className="tabular">{bulkW}{'\u00A0'}г</strong></span>
                  <span className="tabular">{formatRub(Math.round(product.bulk!.pricePerKg / 10))} / 100\u00A0г</span>
                </div>
                <input
                  type="range"
                  min={product.bulk.minG}
                  max={product.bulk.maxG}
                  step={product.bulk.stepG}
                  value={bulkW}
                  aria-label="Вес на развес в граммах"
                  onChange={(e) => setBulkW(parseInt(e.target.value, 10))}
                />
                <div className="tolerance-hint">Точный вес определим на весах при фасовке (допуск ±15{'\u00A0'}г [допуск уточнить]).</div>
              </div>
            )}
          </>
        )}

        <div className="card-footer">
          <div className="price-stack">
            <span className="price-label">{active.caption}</span>
            <strong className="price-value tabular">{formatRub(active.price)}</strong>
          </div>
          <button
            ref={addBtnRef}
            type="button"
            className="add-btn"
            onClick={onAdd}
            disabled={!active.canAdd && !added}
          >
            {added ? 'Добавлено' : active.canAdd ? 'Добавить в корзину' : 'Кусок в корзине'}
          </button>
        </div>
      </div>
    </article>
  );
}

function countryName(c: string): string {
  const names: Record<string, string> = {
    ru: 'Россия', es: 'Испания', it: 'Италия', gr: 'Греция', fr: 'Франция', ch: 'Швейцария',
  };
  return names[c] || '';
}
