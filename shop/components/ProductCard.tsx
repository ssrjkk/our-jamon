'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import type { Product } from '@/lib/types';
import { averageWeightOf, piecePriceOf, calcPricePer100g, CATEGORY_TITLES } from '@/lib/products';
import { weightPriceOf, formatGrams, CUT_WEIGHT_MIN_G, CUT_WEIGHT_MAX_G, CUT_RANGE } from '@/lib/price';
import { useCart, formatRub, formatWeightLabel } from './CartContext';
import { ProductArt } from './Art';
import { flyTokenToCart } from './Animations';

interface Props { product: Product; serverReservedPieceIds: string[]; detail?: boolean; headingLevel?: 'h3' | 'h4' }

export default function ProductCard({ product, serverReservedPieceIds, detail = false, headingLevel = 'h4' }: Props) {
  const { addLine, reservedPieceIds } = useCart();
  const id = useId();
  const avgWeight = averageWeightOf(product);
  const [selection, setSelection] = useState(product.kind === 'piece' ? (avgWeight ? 'average' : 'custom') : product.packs.length ? 'pack-0' : 'bulk');
  const [requested, setRequested] = useState(String(avgWeight || 300));
  const [bulkWeight, setBulkWeight] = useState(product.bulk?.minG ?? 0);
  const [feedback, setFeedback] = useState('');
  const addRef = useRef<HTMLButtonElement>(null);
  const fixedPrice = product.kind === 'piece' && product.category === 'leg' ? product.pieces[0]?.price : undefined;
  const isFixed = typeof fixedPrice === 'number';
  const reserved = new Set([...serverReservedPieceIds, ...reservedPieceIds]);
  const hasPiece = product.pieces.some((piece) => !reserved.has(piece.id1c));
  const customWeight = Number(requested);
  const validCustom = Number.isSafeInteger(customWeight) && customWeight >= CUT_WEIGHT_MIN_G && customWeight <= CUT_WEIGHT_MAX_G;
  const packIndex = selection.startsWith('pack-') ? Number(selection.slice(5)) : 0;
  const pack = product.packs[packIndex];
  const custom = product.kind === 'piece' && product.category === 'piece' && selection === 'custom';
  const bulk = product.kind !== 'piece' && selection === 'bulk' && Boolean(product.bulk);
  const weightG = product.kind === 'piece' ? custom ? customWeight : avgWeight : bulk ? bulkWeight : pack?.weightG ?? 0;
  const price = product.kind === 'piece' ? piecePriceOf(product, weightG || 0, fixedPrice) : bulk ? weightPriceOf(bulkWeight, product.bulk?.pricePerKg ?? 0) : pack?.price ?? 0;
  const canAdd = product.kind === 'piece' ? (custom ? validCustom : hasPiece && avgWeight > 0) : bulk ? Boolean(product.bulk) : Boolean(pack);
  const label = product.kind === 'piece'
    ? custom ? `Отрез ${formatWeightLabel(weightG)}` : `${product.category === 'leg' ? 'На кости' : 'Средний кусок'} · ~${formatWeightLabel(weightG)}`
    : bulk ? `На развес ${formatWeightLabel(weightG)}` : pack?.label ?? 'Нет фасовки';
  const caption = isFixed ? 'Фиксированная цена за штуку' : product.kind === 'piece' || bulk ? 'Предварительная сумма' : 'Цена за фасовку';
  const pricePer100 = product.kind === 'piece' ? calcPricePer100g(product.pricePerKg)
    : bulk ? calcPricePer100g(product.bulk?.pricePerKg ?? 0) : pack?.weightG ? pack.price * 100 / pack.weightG : 0;
  const Heading = detail ? 'h1' : headingLevel;

  function choose(value: string) { setSelection(value); setFeedback(''); }
  type Choice = { key: string; label: string; sub: string; checked: boolean; select: () => void };
  // Выбор имеет смысл от двух вариантов: единственный формат карточка показывает строкой.
  const choices: Choice[] = (product.kind === 'piece'
    ? [
        avgWeight > 0 && { key: 'average', label: product.category === 'leg' ? 'Целиком' : 'Средний кусок', sub: `~${formatWeightLabel(avgWeight)}`, checked: !custom, select: () => choose('average') },
        product.category === 'piece' && { key: 'custom', label: 'Отрез под заказ', sub: `${CUT_WEIGHT_MIN_G}–${formatGrams(CUT_WEIGHT_MAX_G)}`, checked: custom, select: () => choose('custom') },
      ]
    : [
        ...product.packs.map((option, index) => ({ key: `pack-${index}`, label: option.label, sub: formatRub(option.price), checked: selection === `pack-${index}`, select: () => choose(`pack-${index}`) })),
        ...(product.bulk ? [{ key: 'bulk', label: 'На развес', sub: `${product.bulk.minG}–${formatGrams(product.bulk.maxG)}`, checked: bulk, select: () => choose('bulk') }] : []),
      ]
  ).filter((choice): choice is Choice => Boolean(choice));
  function add() {
    if (!canAdd) { setFeedback(custom && !validCustom ? `Укажите целый вес ${CUT_RANGE}.` : 'Товар сейчас недоступен. Уточните наличие в лавке.'); return; }
    const success = addLine({
      productId: product.id, title: product.title, label, price, weightG,
      requiresWeightCheck: product.kind === 'piece' || bulk, pieceId1c: null,
      kind: product.kind === 'piece' ? custom ? 'custom' : 'average' : bulk ? 'bulk' : 'pack',
      packIdx: product.kind !== 'piece' && !bulk ? packIndex : undefined, qty: 1,
    });
    if (!success) { setFeedback('Достигнуто максимальное количество. Измените количество в корзине.'); return; }
    setFeedback('Добавлено в корзину.');
    if (addRef.current) flyTokenToCart(addRef.current.getBoundingClientRect(), product.category === 'olives' ? 'olive' : 'ham');
  }

  return (
    <article className={'product-card' + (detail ? ' product-detail-card' : '')} data-product-id={product.id}>
      <div className="product-card-intro">
        <div className="card-media"><ProductArt product={product} /></div>
        <div className="card-header-row"><Heading className="card-title">{detail ? product.title : <Link href={`/product/${product.id}`}>{product.title}</Link>}</Heading></div>
        <div className="card-meta">{product.agingMonths ? `${product.agingMonths}\u00A0мес. выдержки` : CATEGORY_TITLES[product.category].short}</div>
        {product.description && <p className="card-desc">{product.description}</p>}
        {product.category !== 'extras' && !isFixed && pricePer100 > 0 && <p className="rate-per-100 tabular">{formatRub(Math.round(pricePer100))} / 100&nbsp;г</p>}
      </div>
      <div className="selector-dynamic-slot">
        {choices.length > 1
          ? <fieldset className="product-options"><legend className="selector-caption">{product.kind === 'piece' ? 'Какой формат вам подходит?' : 'Фасовка'}</legend><div className="options-wrap">{choices.map((choice) => <label className="option-chip" key={choice.key}><input type="radio" name={`${id}-format`} checked={choice.checked} onChange={choice.select} /><span>{choice.label}<small className="chip-sub">{choice.sub}</small></span></label>)}</div></fieldset>
          : choices.length === 1 && <div className="product-options"><div className="selector-caption">{product.kind === 'piece' ? 'Формат' : 'Фасовка'}</div>{choices.map((choice) => <p className="option-static" key={choice.key}><span>{choice.label}</span><small className="chip-sub">{choice.sub}</small></p>)}</div>}
        {custom && <div className="form-field" aria-live="polite" aria-relevant="additions"><label htmlFor={`${id}-weight`}>Желаемый вес отреза, г</label><input className="form-input tabular" id={`${id}-weight`} type="number" inputMode="numeric" min={CUT_WEIGHT_MIN_G} max={CUT_WEIGHT_MAX_G} step="1" value={requested} aria-invalid={!validCustom} aria-describedby={!validCustom ? `${id}-weight-error` : undefined} onChange={(event) => { setRequested(event.target.value); setFeedback(''); }} />{!validCustom && <p id={`${id}-weight-error`} className="card-feedback">Укажите целый вес {CUT_RANGE}.</p>}</div>}
        {bulk && product.bulk && <div className="bulk-slider-box"><label htmlFor={`${id}-bulk`}>Вес порции: <strong className="tabular">{formatWeightLabel(bulkWeight)}</strong></label><input id={`${id}-bulk`} type="range" min={product.bulk.minG} max={product.bulk.maxG} step={product.bulk.stepG} value={bulkWeight} onChange={(event) => { setBulkWeight(Number(event.target.value)); setFeedback(''); }} /></div>}
        {(product.kind === 'piece' || bulk) && <p className="custom-cut-note">{isFixed ? 'Вес уточним при сборке. Цена за штуку останется прежней.' : custom ? 'Подберём отрез по вашему запросу. Точный вес и сумму согласуем перед оплатой.' : 'Точный вес и сумму подтвердим перед оплатой.'}</p>}
        <div className="card-footer"><div className="price-stack"><span className="price-label">{canAdd ? caption : custom && !validCustom ? 'Укажите вес' : 'Нет в наличии'}</span><strong className="price-value tabular">{canAdd ? formatRub(price) : '—'}</strong></div><button ref={addRef} type="button" className="add-btn" disabled={!canAdd} onClick={add}>В корзину <span aria-hidden="true">+</span></button></div>
        <p className="card-feedback" role="status" aria-live="polite">{feedback}</p>
      </div>
    </article>
  );
}
