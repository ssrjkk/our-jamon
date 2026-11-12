import { NextRequest, NextResponse } from 'next/server';
import { getOrder, mutateOrder, formatWeight, OrderConflict } from '@/lib/orders';
import { getAuthorizedOrder } from '@/lib/order-access';
import { CheckoutError, initializeOrderPayment } from '@/lib/checkout';
import { deliveryCostFor } from '@/lib/delivery';
import { weightPriceOf } from '@/lib/price';
import { isDemoMode, requestOriginAllowed } from '@/lib/config';
import { syncOrderToOneC } from '@/lib/onec';
import { isAdmin } from '@/lib/admin';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const order = await getAuthorizedOrder(id, req.nextUrl.searchParams.get('token') || req.headers.get('x-order-token'));
  if (!order) return NextResponse.json({ error: 'Заказ не найден.' }, { status: 404 });
  return NextResponse.json({ id: order.id, status: order.status, items: order.items.map(({ title, label, price, weightG, qty, requiresWeightCheck, weightConfirmed }) => ({ title, label, price, weightG, qty, requiresWeightCheck, weightConfirmed })), itemsSum: order.itemsSum, delivery: order.delivery, total: order.total, paymentUrl: order.paymentUrl || null, paymentError: Boolean(order.paymentError), createdAt: order.createdAt, demo: order.demo }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const origin = req.headers.get('origin');
  if (!requestOriginAllowed(origin, req.headers.get('host'), req.nextUrl.origin)) return NextResponse.json({ error: 'Недопустимый источник запроса.' }, { status: 403 });
  if (!await isAdmin()) return NextResponse.json({ error: 'Требуется авторизация администратора.' }, { status: 401 });
  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('action' in body)) return NextResponse.json({ error: 'Некорректное действие.' }, { status: 400 });
  const existing = await getOrder(id);
  if (!existing) return NextResponse.json({ error: 'Заказ не найден.' }, { status: 404 });
  try {
    if (body.action === 'confirm-order') {
      const weights = 'weights' in body ? body.weights : undefined;
      if (!weights || typeof weights !== 'object' || Array.isArray(weights)) throw new CheckoutError('Укажите веса всех весовых позиций.');
      const actual = weights as Record<string, unknown>;
      const shipping = 'deliveryCost' in body ? body.deliveryCost : undefined;
      const confirmed = await mutateOrder(id, (order) => {
        if (order.status !== 'awaiting_confirmation') throw new OrderConflict('Заказ уже согласован или закрыт.');
        const weighted = order.items.filter((item) => item.requiresWeightCheck);
        if (Object.keys(actual).some((uid) => !weighted.some((item) => item.uid === uid))) throw new CheckoutError('Неизвестная весовая позиция.');
        for (const item of weighted) {
          const weight = actual[item.uid];
          if (typeof weight !== 'number' || !Number.isSafeInteger(weight) || weight <= 0 || weight > 30000) throw new CheckoutError('Для каждой весовой позиции укажите целый вес от 1 до 30 000 г.');
          item.weightG = weight;
          item.label = item.label.replace(/~?[\d.,]+[\u00a0 ](?:кг|г)/, formatWeight(weight));
          if (item.pricePerKg !== null) item.price = weightPriceOf(weight, item.pricePerKg);
          if (!Number.isSafeInteger(item.price) || item.price <= 0) throw new CheckoutError('Не удалось рассчитать цену позиции.');
          item.weightConfirmed = true;
        }
        if (shipping !== undefined) {
          if (typeof shipping !== 'number' || !Number.isSafeInteger(shipping) || shipping < 0 || shipping > 100000) throw new CheckoutError('Укажите корректную стоимость доставки.');
          order.delivery.baseCost = shipping;
        }
        order.itemsSum = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
        order.delivery.cost = deliveryCostFor(order.delivery, order.itemsSum);
        if (order.delivery.cost === null) throw new CheckoutError('Сначала подтвердите стоимость доставки.');
        order.total = order.itemsSum + order.delivery.cost;
        order.status = 'awaiting_payment';
      });
      const updated = await initializeOrderPayment(id, process.env.SHOP_URL || req.nextUrl.origin) || confirmed;
      if (updated) await syncOrderToOneC(updated);
      return NextResponse.json({ order: updated });
    }
    if (body.action === 'retry-payment') {
      const updated = await initializeOrderPayment(id, process.env.SHOP_URL || req.nextUrl.origin);
      return NextResponse.json({ order: updated });
    }
    if (body.action === 'sync-onec') return NextResponse.json({ ok: await syncOrderToOneC(existing) });
    if (body.action === 'cancel') {
      const updated = await mutateOrder(id, (order) => {
        if (order.status === 'paid') throw new OrderConflict('Оплаченный заказ нельзя отменить здесь. Возврат выполняется через банк.');
        if (!order.demo && order.paymentId) throw new OrderConflict('Сначала отмените платёж в кабинете банка. До подтверждения банка резерв не снимается.');
        order.status = 'cancelled';
      });
      if (updated) await syncOrderToOneC(updated);
      return NextResponse.json({ order: updated });
    }
    return NextResponse.json({ error: 'Неизвестное действие.' }, { status: 400 });
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof OrderConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: 'Не удалось обновить заказ.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest, { params }: Context) {
  const origin = req.headers.get('origin');
  if (!requestOriginAllowed(origin, req.headers.get('host'), req.nextUrl.origin)) return NextResponse.json({ error: 'Недопустимый источник запроса.' }, { status: 403 });
  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('action' in body)) return NextResponse.json({ error: 'Некорректное действие.' }, { status: 400 });
  const token = 'token' in body && typeof body.token === 'string' ? body.token : req.nextUrl.searchParams.get('token');
  const order = await getAuthorizedOrder(id, token);
  if (!order) return NextResponse.json({ error: 'Заказ не найден.' }, { status: 404 });
  try {
    if (body.action === 'retry-payment') {
      const updated = await initializeOrderPayment(id, process.env.SHOP_URL || req.nextUrl.origin);
      return NextResponse.json({ ok: Boolean(updated?.paymentUrl && !updated.paymentError) });
    }
    if (body.action !== 'demo-pay' || !isDemoMode() || !order.demo || !order.paymentId?.startsWith('DEMO-')) return NextResponse.json({ error: 'Демо-оплата недоступна.' }, { status: 403 });
    await mutateOrder(id, (current) => {
      if (current.status === 'paid') return;
      if (current.status !== 'awaiting_payment') throw new OrderConflict('Заказ ещё не готов к оплате.');
      current.status = 'paid';
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof OrderConflict ? error.message : 'Оплата временно недоступна.' }, { status: error instanceof OrderConflict ? 409 : 503 });
  }
}
