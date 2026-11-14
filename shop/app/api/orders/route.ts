import { NextRequest, NextResponse } from 'next/server';
import { Order } from '@/lib/types';
import { saveOrder, readOrders, generateOrderId, newAccessToken, OrderConflict } from '@/lib/orders';
import { CheckoutError, initializeOrderPayment, quoteCart } from '@/lib/checkout';
import { orderCookieName } from '@/lib/order-access';
import { catalogHealth } from '@/lib/products';
import { syncOrderToOneC } from '@/lib/onec';
import { isAdmin } from '@/lib/admin';
import { requestOriginAllowed } from '@/lib/config';
import { guardAttempts } from '@/lib/rate-limit';
import { logServerError } from '@/lib/server-log';

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!requestOriginAllowed(origin, req.headers.get('host'), req.nextUrl.origin)) return NextResponse.json({ error: 'Недопустимый источник запроса.' }, { status: 403 });
  const limited = guardAttempts('order', req.headers, 20, 60000);
  if (limited) return limited;
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('customer' in body) || !body.customer || typeof body.customer !== 'object') return NextResponse.json({ error: 'Укажите данные для связи.' }, { status: 400 });
  const customer = body.customer;
  if (!('name' in customer) || typeof customer.name !== 'string' || !customer.name.trim() || customer.name.length > 100) return NextResponse.json({ error: 'Укажите ваше имя.' }, { status: 400 });
  if (!('phone' in customer) || typeof customer.phone !== 'string' || customer.phone.length > 30 || !/^[+\d\s()-]+$/.test(customer.phone)) return NextResponse.json({ error: 'Введите полный номер телефона.' }, { status: 400 });
  const digits = customer.phone.replace(/\D/g, '').replace(/^8/, '7');
  if (!/^7\d{10}$/.test(digits)) return NextResponse.json({ error: 'Введите номер +7 и 10 цифр.' }, { status: 400 });
  if (!('consent' in body) || body.consent !== true) return NextResponse.json({ error: 'Подтвердите согласие на обработку данных для заказа.' }, { status: 400 });
  if (!('items' in body) || !('deliveryId' in body)) return NextResponse.json({ error: 'Некорректная корзина.' }, { status: 400 });
  const address = 'deliveryAddress' in body ? body.deliveryAddress : '';
  if (typeof address !== 'string' || address.length > 500) return NextResponse.json({ error: 'Проверьте адрес получения заказа.' }, { status: 400 });
  if (body.deliveryId !== 'pickup' && !address.trim()) return NextResponse.json({ error: 'Укажите адрес доставки или пункта выдачи.' }, { status: 400 });
  const messenger = 'messenger' in body ? body.messenger : 'SMS';
  if (messenger !== 'Telegram' && messenger !== 'WhatsApp' && messenger !== 'SMS') return NextResponse.json({ error: 'Выберите способ связи.' }, { status: 400 });
  try {
    const quote = await quoteCart(body.items, body.deliveryId, address.trim());
    if (!('expectedItemsSum' in body) || body.expectedItemsSum !== quote.itemsSum || !('expectedDeliveryCost' in body) || body.expectedDeliveryCost !== quote.delivery.cost) {
      return NextResponse.json({ error: 'Стоимость обновилась. Проверьте расчёт и отправьте заказ ещё раз.', quote }, { status: 409 });
    }
    const now = new Date().toISOString();
    const order: Order = {
      id: generateOrderId(), accessToken: newAccessToken(), createdAt: now, consentedAt: now, demo: quote.demo,
      customer: { name: customer.name.trim(), phone: '+' + digits }, delivery: quote.delivery, messenger,
      items: quote.items, itemsSum: quote.itemsSum, total: quote.total,
      status: quote.needsConfirmation ? 'awaiting_confirmation' : 'awaiting_payment',
    };
    let saved = await saveOrder(order);
    if (saved.status === 'awaiting_payment') saved = await initializeOrderPayment(saved.id, process.env.SHOP_URL || req.nextUrl.origin) || saved;
    await syncOrderToOneC(saved);
    const response = NextResponse.json({ orderId: saved.id, accessToken: saved.accessToken, status: saved.status, paymentUrl: saved.paymentUrl || null, paymentError: Boolean(saved.paymentError), total: saved.total, demo: saved.demo }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(orderCookieName(saved.id), saved.accessToken, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 60 * 60, path: '/' });
    return response;
  } catch (error) {
    if (error instanceof CheckoutError) {
      if (error.status >= 500) logServerError('order-create', error);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof OrderConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    // Сюда доходят отказы, которые покупатель уже считает принятым заказом: в журнале
    // обязана остаться исходная причина, а не только вежливый текст на витрине.
    logServerError('order-create', error);
    return NextResponse.json({ error: 'Не удалось сохранить заказ. Попробуйте позже или свяжитесь с лавкой.' }, { status: 503 });
  }
}

// GET /api/orders — список заказов (только админ)
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Требуется авторизация администратора' }, { status: 401 });
  }
  const orders = await readOrders();
  return NextResponse.json({ orders, catalog: catalogHealth() });
}
