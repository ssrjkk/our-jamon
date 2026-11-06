import { NextRequest, NextResponse } from 'next/server';
import { getOrder, updateOrder } from '@/lib/orders';
import { createTbankPayment } from '@/lib/tbank';
import { sendPaymentLink } from '@/lib/onec';
import { isAdmin } from '@/lib/admin';

// GET /api/orders/[id] — статус заказа для клиента
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
  // Клиенту не отдаём внутренние поля оплаты
  return NextResponse.json({
    id: order.id,
    status: order.status,
    items: order.items,
    itemsSum: order.itemsSum,
    delivery: order.delivery,
    total: order.total,
    paymentUrl: order.paymentUrl || null,
    createdAt: order.createdAt,
  });
}

// PATCH /api/orders/[id] — действия админа: подтверждение веса, отмена, повторная отправка ссылки
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Требуется авторизация администратора' }, { status: 401 });
  }
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const baseUrl = process.env.SHOP_URL || req.nextUrl.origin;

  if (action === 'confirm-weight') {
    // Менеджер взвесил кусок: { itemId, actualWeightG }
    const itemId = body.itemId as string;
    const actualWeightG = Math.round(Number(body.actualWeightG));
    if (!itemId || !actualWeightG || actualWeightG <= 0) {
      return NextResponse.json({ error: 'Нужны itemId и actualWeightG' }, { status: 400 });
    }
    const item = order.items.find((i) => i.uid === itemId);
    if (!item) return NextResponse.json({ error: 'Позиция не найдена' }, { status: 404 });
    item.weightG = actualWeightG;
    item.label = item.label.replace(/[\d.,]+\u00A0(г|кг)/, formatWeight(actualWeightG));
    // Пересчёт цены по прайсу товара
    const { findProduct } = await import('@/lib/products');
    const product = findProduct(item.productId);
    if (product) {
      item.price = Math.round((actualWeightG / 1000) * product.pricePerKg);
    }
    order.itemsSum = order.items.reduce((acc, i) => acc + i.price * (i.qty || 1), 0);
    order.total = order.itemsSum + order.delivery.cost;
    const payment = await createTbankPayment({
      orderId: order.id,
      amountRub: order.total,
      description: `Заказ ${order.id} (вес подтверждён) - Наш Хамон`,
      customerPhone: order.customer.phone,
      baseUrl,
    });
    if (!payment.ok) {
      return NextResponse.json({ error: 'Платёжный шлюз недоступен: ' + payment.error }, { status: 502 });
    }
    order.status = 'awaiting_payment';
    order.paymentUrl = payment.paymentUrl;
    order.paymentId = payment.paymentId;
    const updated = await updateOrder(id, order);
    await sendPaymentLink(updated!);
    return NextResponse.json({ order: updated });
  }

  if (action === 'resend-link') {
    if (!order.paymentUrl) return NextResponse.json({ error: 'Ссылка ещё не сформирована' }, { status: 400 });
    await sendPaymentLink(order);
    return NextResponse.json({ ok: true });
  }

  if (action === 'cancel') {
    const updated = await updateOrder(id, { status: 'cancelled' });
    return NextResponse.json({ order: updated });
  }

  return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
}

function formatWeight(weightG: number): string {
  if (weightG >= 1000) {
    return (weightG / 1000).toFixed(1).replace('.', ',') + '\u00A0кг';
  }
  return String(weightG) + '\u00A0г';
}
