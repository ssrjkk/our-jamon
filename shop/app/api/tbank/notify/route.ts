import { NextRequest, NextResponse } from 'next/server';
import { verifyTbankNotification } from '@/lib/tbank';
import { getOrder, mutateOrder } from '@/lib/orders';
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
  const order = await getOrder(body.OrderId);
  const amount = Number(body.Amount);
  if (!order || order.demo || !order.paymentId || order.paymentId !== String(body.PaymentId) || order.total === null
    || !Number.isSafeInteger(amount) || amount !== order.total * 100) return NextResponse.json({ error: 'Payment does not match order' }, { status: 409 });
  const success = body.Success === true || body.Success === 'true';
  let changed = false;
  const updated = await mutateOrder(order.id, (current) => {
    if (current.paymentId !== String(body.PaymentId) || current.total !== order.total || current.status !== 'awaiting_payment') return;
    if (success && body.Status === 'CONFIRMED') {
      current.status = 'paid';
      current.paymentError = false;
      changed = true;
    } else if (success && body.Status === 'CANCELED') {
      current.status = 'cancelled';
      changed = true;
    } else if (body.Status === 'REJECTED' || body.Status === 'DEADLINE_EXPIRED') {
      current.paymentError = true;
    }
  });
  if (changed && updated) await syncOrderToOneC(updated);
  return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
