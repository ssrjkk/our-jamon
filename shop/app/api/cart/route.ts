import { NextRequest, NextResponse } from 'next/server';
import { CheckoutError, quoteCart } from '@/lib/checkout';

export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('items' in body) || !('deliveryId' in body)) return NextResponse.json({ error: 'Некорректная корзина.' }, { status: 400 });
  try {
    const quote = await quoteCart(body.items, body.deliveryId);
    return NextResponse.json({ quote }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Не удалось рассчитать корзину. Попробуйте позже.' }, { status: 503 });
  }
}
