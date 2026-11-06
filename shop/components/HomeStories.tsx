'use client';

import Stories from './Stories';
import { useCart, formatRub } from './CartContext';
import { Product } from '@/lib/types';
import { runPig } from './Animations';

// Обёртка историй для главной: связывает сторис с корзиной.
export default function HomeStories({ products, serverReservedPieceIds }: { products: Product[]; serverReservedPieceIds: string[] }) {
  const { addLine, reservedPieceIds } = useCart();

  // Первый свободный кусок «16» — как в свежем распиле
  const hamon16 = products.find((p) => p.id === 'hamon-16-piece');
  const reserved = new Set([...serverReservedPieceIds, ...reservedPieceIds]);
  const piece = hamon16
    ? hamon16.pieces.filter((p) => !reserved.has(p.id1c)).map((p) => ({
        productId: hamon16.id,
        pieceId1c: p.id1c,
        weightG: p.weightG,
        price: p.price ?? Math.round((p.weightG / 1000) * hamon16.pricePerKg),
      }))[0] ?? null
    : null;

  return (
    <Stories
      piece={piece}
      onPieceAdd={() => {
        if (!piece) return;
        addLine({
          productId: piece.productId,
          title: 'Хамон «16», кусок в вакууме',
          label: `Кусок ${piece.weightG}\u00A0г`,
          price: piece.price,
          weightG: piece.weightG,
          requiresWeightCheck: true,
          pieceId1c: piece.pieceId1c,
          kind: 'piece',
          qty: 1,
        });
        runPig();
      }}
      onSetAdd={(setId) => {
        const setComponents: Record<string, { productId: string; optionIdx: number }[]> = {
          evening: [
            { productId: 'hamon-sliced-22', optionIdx: 0 },
            { productId: 'olives-gordal', optionIdx: 0 },
            { productId: 'grissini', optionIdx: 0 },
          ],
        };
        for (const c of setComponents[setId] || []) {
          const product = products.find((p) => p.id === c.productId);
          const pack = product?.packs[c.optionIdx];
          if (!pack) continue;
          addLine({
            productId: product!.id,
            title: product!.title,
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
        runPig();
      }}
    />
  );
}

export function setTotal(products: Product[], components: { productId: string; optionIdx: number }[]): number {
  return components.reduce((acc, c) => {
    const p = products.find((x) => x.id === c.productId);
    const pack = p?.packs[c.optionIdx];
    return acc + (pack ? pack.price : 0);
  }, 0);
}

export { formatRub };
