import { NextRequest, NextResponse } from 'next/server';
import { CheckoutError, quoteCart } from '@/lib/checkout';
import { requestOriginAllowed } from '@/lib/config';
import { guardAttempts } from '@/lib/rate-limit';
import { logServerError } from '@/lib/server-log';

export async function POST(req: NextRequest) {
  // Ручка пересчитывает корзину на сервере и в живом режиме тянет выгрузку 1С, поэтому
  // она стоит в одном ряду с оформлением заказа: чужая страница не должна звать её
  // молча, а один адрес — гонять 1С по кругу без остановки.
  const origin = req.headers.get('origin');
  if (!requestOriginAllowed(origin, req.headers.get('host'), req.nextUrl.origin)) return NextResponse.json({ error: 'Недопустимый источник запроса.' }, { status: 403 });
  const limited = guardAttempts('cart', req.headers, 60, 60000);
  if (limited) return limited;
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('items' in body) || !('deliveryId' in body)) return NextResponse.json({ error: 'Некорректная корзина.' }, { status: 400 });
  try {
    const quote = await quoteCart(body.items, body.deliveryId);
    return NextResponse.json({ quote }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof CheckoutError) {
      if (error.status >= 500) logServerError('cart', error);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logServerError('cart', error);
    return NextResponse.json({ error: 'Не удалось рассчитать корзину. Попробуйте позже.' }, { status: 503 });
  }
}
