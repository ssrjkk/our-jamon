import { connection, NextResponse } from 'next/server';
import { getProducts } from '@/lib/products';
import { reservedPieceIds } from '@/lib/orders';
import { isDemoMode } from '@/lib/config';

export async function GET() {
  await connection();
  try {
    const products = await getProducts();
    const reserved = await reservedPieceIds();
    return NextResponse.json({ products, reservedPieceIds: [...reserved], demo: isDemoMode() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Каталог временно недоступен.' }, { status: 503 });
  }
}
