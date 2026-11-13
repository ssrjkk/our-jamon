'use client';

import Stories from './Stories';
import { useCart } from './CartContext';
import type { Product } from '@/lib/types';
import { piecePriceOf } from '@/lib/products';
import { formatGrams } from '@/lib/price';
import { KITS } from '@/lib/products';
import { resolveKit } from './Scenarios';

export default function HomeStories({ products }: { products: Product[] }) {
  const { addLine, addLines } = useCart();
  const available = products.filter((product) => product.kind === 'piece' && product.category === 'piece');
  const hamon = available.find((product) => product.id === 'nf-00000213') ?? available[0];
  const weightG = 300;
  const piece = hamon ? { productId: hamon.id, title: hamon.title, weightG, price: piecePriceOf(hamon, weightG) } : null;
  const evening = KITS.find((kit) => kit.id === 'evening');
  const kit = evening ? resolveKit(products, evening.items) : null;

  return <Stories piece={piece} setAvailable={Boolean(kit)} setPrice={kit?.reduce((sum, item) => sum + item.pack.price, 0)}
    onPieceAdd={() => {
      if (!piece) return false;
      return addLine({ productId: piece.productId, title: piece.title, label: `Отрез под заказ ~${formatGrams(piece.weightG)}`, price: piece.price, weightG: piece.weightG, requiresWeightCheck: true, pieceId1c: null, kind: 'custom', qty: 1 });
    }}
    onSetAdd={() => {
      if (!kit) return 'Полный набор сейчас недоступен. Выберите товары в каталоге.';
      return addLines(kit.map(({ product, pack, packIdx }) => ({
        productId: product.id, title: product.title, label: pack.label, price: pack.price,
        weightG: pack.weightG, requiresWeightCheck: false, pieceId1c: null, kind: 'pack', packIdx, qty: 1,
      }))) || 'Набор не добавлен: достигнут лимит корзины. Уменьшите количество товаров и попробуйте снова.';
    }} />;
}
