'use client';

import Stories from './Stories';
import { useCart, formatRub } from './CartContext';
import { Product } from '@/lib/types';
import { runPig } from './Animations';

// Обёртка историй для главной: связывает сторис с корзиной.
export default function HomeStories({ products, serverReservedPieceIds }: { products: Product[]; serverReservedPieceIds: string[] }) {
  const { addLine, reservedPieceIds } = useCart();

  // Первый свободный «кусочек» для истории - по среднему весу (механика Виталия)
  const hamon16 = products.find((p) => p.id === 'hamon-16-piece');
  let piece: { productId: string; pieceId1c: string; weightG: number; price: number } | null = null;
  if (hamon16) {
    const weights = hamon16.pieces.map((p) => p.weightG);
    const avg = weights.length ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length) : 250;
    piece = {
      productId: hamon16.id,
      pieceId1c: 'avg',
      weightG: avg,
      price: Math.round((avg / 1000) * hamon16.pricePerKg),
    };
  }

  return (
    <Stories
      piece={piece}
      onPieceAdd={() => {
        if (!piece) return;
        addLine({
          productId: piece.productId,
          title: 'Хамон «16», кусок в вакууме',
          label: `Кусок ~${piece.weightG}\u00A0г (средний)`,
          price: piece.price,
          weightG: piece.weightG,
          requiresWeightCheck: true,
          pieceId1c: null,
          kind: 'custom',
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
