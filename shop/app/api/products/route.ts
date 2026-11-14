import { connection, NextResponse } from 'next/server';
import { getProducts } from '@/lib/products';
import { reservedPieceIds } from '@/lib/orders';
import { isDemoMode } from '@/lib/config';
import { logServerError } from '@/lib/server-log';

export async function GET() {
  await connection();
  try {
    const products = await getProducts();
    const reserved = await reservedPieceIds();
    return NextResponse.json({ products, reservedPieceIds: [...reserved], demo: isDemoMode() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // getProducts откатывается на прайс 0711 сам, поэтому сюда доходит только отказ базы:
    // витрина теряет резервы кусков, и причина обязана остаться в журнале.
    logServerError('products', error);
    return NextResponse.json({ error: 'Каталог временно недоступен.' }, { status: 503 });
  }
}
