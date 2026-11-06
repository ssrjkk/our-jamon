import { NextRequest, NextResponse } from 'next/server';
import { verifyTbankNotification } from '@/lib/tbank';
import { getOrder, updateOrder } from '@/lib/orders';
import { pushOrderToOneC } from '@/lib/onec';

// POST /api/tbank/notify — webhook Т-Банка об оплате.
// Боевой режим: проверяем Token (sha256) и статус CONFIRMED, помечаем заказ «Оплачен»
// и дёргаем 1С. Мок-режим (без TBANK_PASSWORD) принимает всё.
export async function POST(req: NextRequest) {
  let body: Record<string, string> = {};
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await req.json().catch(() => ({}));
  } else {
    const form = await req.formData().catch(() => null);
    if (form) {
      for (const [k, v] of form.entries()) body[k] = String(v);
    }
  }

  if (!body.OrderId) {
    return NextResponse.json({ error: 'Нет OrderId' }, { status: 400 });
  }

  if (!verifyTbankNotification(body)) {
    return NextResponse.json({ error: 'Подпись не совпала' }, { status: 403 });
  }

  const order = await getOrder(body.OrderId);
  if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });

  // Success=true и статус CONFIRMED — деньги получены
  if (body.Success === 'true' && (body.Status === 'CONFIRMED' || body.Status === 'AUTHORIZED')) {
    if (order.status !== 'paid') {
      const updated = await updateOrder(order.id, { status: 'paid', paymentId: body.PaymentId || order.paymentId });
      await pushOrderToOneC(updated!);
    }
  } else if (body.Success === 'false' || body.Status === 'REJECTED') {
    await updateOrder(order.id, { status: 'cancelled', comment: 'Оплата отклонена банком' });
  }

  return NextResponse.json({ ok: true });
}
