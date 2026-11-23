import { NextRequest, NextResponse } from 'next/server';
import { verifyTbankNotification } from '@/lib/tbank';
import { getOrder, mutateOrder } from '@/lib/orders';
import { paymentIdsOf } from '@/lib/payment-registry';
import { syncOrderToOneC } from '@/lib/onec';
import { logServerNotice } from '@/lib/server-log';

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
  const mismatch = !order ? `заказа ${body.OrderId} нет в базе`
    : order.demo ? 'заказ создан в демо-режиме'
    : !paymentId ? 'уведомление без PaymentId'
    : order.total === null ? 'у заказа нет итоговой суммы'
    : !Number.isSafeInteger(amount) ? `неразборная сумма ${String(body.Amount)}`
    : amount !== order.total * 100 ? `${amount} коп. не совпало с итогом заказа ${order.total * 100} коп.`
    : null;
  if (mismatch || !order) {
    // Подпись уже сошлась, значит банк сообщил о деньгах, которым мы не нашли пары. Отказ
    // остаётся отказом, но без строки в журнале лавка про такие деньги никогда не узнает.
    logServerNotice('tbank-notify', `подписанное уведомление отклонено (${mismatch}): платёж ${paymentId || 'без id'}, статус ${body.Status}`);
    return NextResponse.json({ error: 'Payment does not match order' }, { status: 409 });
  }
  const success = body.Success === true || body.Success === 'true';
  let changed = false;
  const updated = await mutateOrder(order.id, (current) => {
    if (current.total !== order.total) return;
    if (!paymentIdsOf(current).includes(paymentId)) current.paymentIds = [...(current.paymentIds ?? []), paymentId];
    const previousState = current.paymentStates?.[paymentId];
    if (success && body.Status === 'CONFIRMED') {
      if (previousState === 'refunded') return;
      current.paymentStates = { ...current.paymentStates, [paymentId]: 'confirmed' };
      if (current.status === 'awaiting_payment') {
        current.status = 'paid';
        current.paymentError = false;
        current.paidPaymentId = paymentId;
        changed = true;
      } else {
        const accounted = current.paidPaymentId ?? (current.status === 'paid' ? current.paymentId : undefined);
        if (accounted !== paymentId && !current.refundPaymentIds?.includes(paymentId) && !current.refundedPaymentIds?.includes(paymentId)) {
          current.refundPaymentIds = [...(current.refundPaymentIds ?? []), paymentId];
        }
      }
      return;
    }
    if (previousState === 'confirmed' || previousState === 'refunded' || (previousState && previousState !== 'pending')) return;
    const terminalState = success && body.Status === 'CANCELED' ? 'cancelled'
      : body.Status === 'REJECTED' ? 'rejected'
      : body.Status === 'DEADLINE_EXPIRED' ? 'expired'
      : undefined;
    if (!terminalState) return;
    current.paymentStates = { ...current.paymentStates, [paymentId]: terminalState };
    if (current.status === 'awaiting_payment' && current.paymentId === paymentId) {
      current.paymentId = undefined;
      current.paymentUrl = undefined;
      current.sbpPayloadUrl = undefined;
      current.sbpQrSvg = undefined;
      current.paymentError = terminalState !== 'cancelled';
    }
  });
  if (changed && updated) await syncOrderToOneC(updated);
  return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
