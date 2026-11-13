import { NextRequest, NextResponse } from 'next/server';
import { verifyTbankNotification } from '@/lib/tbank';
import { getOrder, mutateOrder } from '@/lib/orders';
import { paymentIdsOf } from '@/lib/payment-registry';
import { syncOrderToOneC } from '@/lib/onec';

export async function POST(req: NextRequest) {
  let value: unknown;
  if (req.headers.get('content-type')?.includes('application/json')) value = await req.json().catch(() => null);
  else {
    const form = await req.formData().catch(() => null);
    value = form ? Object.fromEntries([...form.entries()].map(([key, entry]) => [key, String(entry)])) : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return NextResponse.json({ error: 'Invalid notification' }, { status: 400 });
  const body = value as Record<string, unknown>;
  if (!verifyTbankNotification(body)) return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  if (typeof body.OrderId !== 'string' || typeof body.Status !== 'string' || !['number', 'string'].includes(typeof body.PaymentId) || !['number', 'string'].includes(typeof body.Amount)) return NextResponse.json({ error: 'Invalid payment data' }, { status: 400 });
  const paymentId = String(body.PaymentId).trim();
  const order = await getOrder(body.OrderId);
  const amount = Number(body.Amount);
  // Основанием считать оплату может быть только подпись терминала и точная сумма заказа.
  // PaymentId сюда не входит: банк сообщает его и в тех уведомлениях, чей Init-ответ магазин
  // не успел прочитать (таймаут, 5xx с уже выписанным id). Требовать «знакомый id» означало
  // вечное 409 по фактически списанным деньгам.
  if (!order || order.demo || !paymentId || order.total === null
    || !Number.isSafeInteger(amount) || amount !== order.total * 100) return NextResponse.json({ error: 'Payment does not match order' }, { status: 409 });
  const success = body.Success === true || body.Success === 'true';
  let changed = false;
  const updated = await mutateOrder(order.id, (current) => {
    if (current.total !== order.total) return;
    // Каждое сообщение банка становится записью заказа: по реестру различаются первая и
    // повторная оплаты одного заказа, и по нему же блокируется локальная отмена.
    if (!paymentIdsOf(current).includes(paymentId)) current.paymentIds = [...(current.paymentIds ?? []), paymentId];
    if (current.status === 'awaiting_payment') {
      if (success && body.Status === 'CONFIRMED') {
        current.status = 'paid';
        current.paymentError = false;
        current.paidPaymentId = paymentId;
        changed = true;
      } else if (success && body.Status === 'CANCELED') {
        current.status = 'cancelled';
        changed = true;
      } else if (body.Status === 'REJECTED' || body.Status === 'DEADLINE_EXPIRED') {
        current.paymentError = true;
      }
      return;
    }
    // Оплата по ссылке, которую магазин уже сменил или по которой заказ отменён: деньги на счёте,
    // заказ остаётся в своём статусе, а второй платёж встаёт в очередь на возврат через банк.
    if (success && body.Status === 'CONFIRMED') {
      const accounted = current.paidPaymentId ?? (current.status === 'paid' ? current.paymentId : undefined);
      if (accounted !== paymentId && !current.refundPaymentIds?.includes(paymentId)) {
        current.refundPaymentIds = [...(current.refundPaymentIds ?? []), paymentId];
      }
    }
  });
  if (changed && updated) await syncOrderToOneC(updated);
  return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
