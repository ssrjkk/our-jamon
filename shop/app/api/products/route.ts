import { NextResponse } from 'next/server';
import { getProducts } from '@/lib/products';
import { reservedPieceIds } from '@/lib/orders';

// GET /api/products — каталог с реальными остатками кусков.
// ИНТЕГРАЦИЯ 1С: getProducts() читает ONEC_API_URL, иначе возвращает мок.
// reservedPieceIds — куски, уже забронированные активными заказами.
export async function GET() {
  const products = await getProducts();
  const reserved = await reservedPieceIds();
  return NextResponse.json({ products, reservedPieceIds: Array.from(reserved) });
}
