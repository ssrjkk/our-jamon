import { NextRequest, NextResponse } from 'next/server';
import { getOrder, mutateOrder, formatWeight, recordAdminAudit, OrderConflict } from '@/lib/orders';
import { activePaymentIdsOf } from '@/lib/payment-registry';
import { getAuthorizedOrder } from '@/lib/order-access';
import { CheckoutError, ensureOrderSbpQr, initializeOrderPayment } from '@/lib/checkout';
import { deliveryCostFor } from '@/lib/delivery';
import { weightPriceOf } from '@/lib/price';
import { isDemoMode, requestOriginAllowed } from '@/lib/config';
import { clientAddress, guardAttempts } from '@/lib/rate-limit';
import { logServerError } from '@/lib/server-log';
import { syncOrderToOneC } from '@/lib/onec';
import { cancelTbankPayment, fetchTbankPaymentState, sendTbankClosingReceipt } from '@/lib/tbank';
import { adminIpAllowed, isAdmin } from '@/lib/admin';
import {
  claimPaymentOperation,
  completeClosingReceipt,
  completePaymentRefund,
  failPaymentOperation,
  markPaymentRefunded,
  paidPaymentIdOf,
  refundTargetsOf,
  touchPaymentOperation,
} from '@/lib/payment-operations';
import { Order } from '@/lib/types';

type Context = { params: Promise<{ id: string }> };

function retryConfirmedOf(body: Record<string, unknown>): boolean {
  if ('retryConfirmed' in body && typeof body.retryConfirmed !== 'boolean') throw new CheckoutError('Некорректное подтверждение повторной операции.');
  return body.retryConfirmed === true;
}

function markCodesOf(body: Record<string, unknown>, order: Order): Record<string, string[]> | undefined {
  if (!('markCodes' in body) || body.markCodes === undefined) return undefined;
  if (!body.markCodes || typeof body.markCodes !== 'object' || Array.isArray(body.markCodes)) throw new CheckoutError('Некорректные коды маркировки.');
  const quantities = new Map(order.items.map((item) => [item.uid, item.qty]));
  const result: Record<string, string[]> = {};
  for (const [uid, codes] of Object.entries(body.markCodes)) {
    const qty = quantities.get(uid);
    if (qty === undefined || !Array.isArray(codes) || codes.length !== qty || codes.some((code) => typeof code !== 'string' || !code.trim() || code.length > 2048)) {
      throw new CheckoutError('Для каждой маркированной позиции укажите ровно один код DataMatrix на единицу товара.');
    }
    const clean = codes.map((code) => code.trim());
    if (new Set(clean).size !== clean.length) throw new CheckoutError('Коды DataMatrix не должны повторяться.');
    result[uid] = clean;
  }
  return result;
}

export async function GET(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const order = await getAuthorizedOrder(id, req.nextUrl.searchParams.get('token') || req.headers.get('x-order-token'), clientAddress(req.headers));
  if (!order) return NextResponse.json({ error: 'Заказ не найден.' }, { status: 404 });
  return NextResponse.json({
    id: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod ?? 'card',
    items: order.items.map(({ title, label, price, weightG, qty, requiresWeightCheck, weightConfirmed }) => ({ title, label, price, weightG, qty, requiresWeightCheck, weightConfirmed })),
    itemsSum: order.itemsSum,
    delivery: order.delivery,
    total: order.total,
    paymentUrl: order.paymentUrl || null,
    sbpPayloadUrl: order.sbpPayloadUrl || null,
    sbpQrSvg: order.sbpQrSvg || null,
    paymentError: Boolean(order.paymentError),
    createdAt: order.createdAt,
    demo: order.demo,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const origin = req.headers.get('origin');
  if (!requestOriginAllowed(origin, req.headers.get('host'), req.nextUrl.origin)) return NextResponse.json({ error: 'Недопустимый источник запроса.' }, { status: 403 });
  const ip = clientAddress(req.headers);
  if (!adminIpAllowed(ip)) return NextResponse.json({ error: 'Доступ с этого адреса запрещён.' }, { status: 403 });
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
          if (typeof weight !== 'number' || !Number.isSafeInteger(weight) || weight <= 0 || weight > 30000) throw new CheckoutError('Для каждой весовой позиции укажите целый вес от 1 до 30\u00A0000\u00A0г.');
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
      const updated = confirmed?.paymentMethod === 'pay_on_pickup'
        ? confirmed
        : await initializeOrderPayment(id, process.env.SHOP_URL || req.nextUrl.origin) || confirmed;
      recordAdminAudit('confirm_order', ip, id, `total=${updated?.total ?? 'null'}`);
      if (updated) await syncOrderToOneC(updated);
      return NextResponse.json({ order: updated });
    }
    if (body.action === 'retry-payment') {
      const updated = await initializeOrderPayment(id, process.env.SHOP_URL || req.nextUrl.origin);
      recordAdminAudit('retry_payment', ip, id, updated?.paymentUrl ? 'ok' : 'error');
      return NextResponse.json({ order: updated });
    }
    if (body.action === 'sync-onec') {
      const ok = await syncOrderToOneC(existing);
      recordAdminAudit('sync_onec', ip, id, ok ? 'ok' : 'error');
      return NextResponse.json({ ok });
    }
    if (body.action === 'mark-pickup-paid') {
      const updated = await mutateOrder(id, (order) => {
        if (order.paymentMethod !== 'pay_on_pickup') throw new OrderConflict('Отметить оплату в лавке можно только для заказов с оплатой при получении.');
        if (order.status === 'paid') return;
        if (order.status !== 'awaiting_payment') throw new OrderConflict('Сначала подтвердите вес и сумму заказа.');
        order.status = 'paid';
      });
      recordAdminAudit('mark_pickup_paid', ip, id);
      if (updated) await syncOrderToOneC(updated);
      return NextResponse.json({ order: updated });
    }
    if (body.action === 'refund-payment') {
      const retryConfirmed = retryConfirmedOf(body);
      const claim = await claimPaymentOperation(id, 'refund', retryConfirmed);
      if (claim.state === 'missing') return NextResponse.json({ error: 'Заказ не найден.' }, { status: 404 });
      if (claim.state === 'done') return NextResponse.json({ order: claim.order });
      if (claim.state === 'busy') throw new OrderConflict(`Возврат уже выполняется. Повторите через ${claim.retryAfterSeconds} с.`);
      if (claim.state === 'confirmation-required') throw new OrderConflict('Результат предыдущего возврата не подтверждён. Проверьте кабинет Т-Банка и повторите действие с подтверждением.');
      const operationId = claim.operationId;
      const reconcile = (claim.order.paymentOperation?.attempt ?? 1) > 1;
      let failure: string | undefined;
      while (!failure) {
        const current = await getOrder(id);
        if (!current) return NextResponse.json({ error: 'Заказ не найден.' }, { status: 404 });
        const targets = refundTargetsOf(current);
        if (targets.length === 0) break;
        for (const paymentId of targets) {
          if (!await touchPaymentOperation(id, operationId)) throw new OrderConflict('Операция возврата уже выполняется другим запросом.');
          if (reconcile) {
            const state = await fetchTbankPaymentState(paymentId);
            if (!state.ok) { failure = state.error || 'state_unavailable'; break; }
            if (state.status === 'REFUNDED') {
              await markPaymentRefunded(id, operationId, paymentId);
              continue;
            }
            if (state.status !== 'CONFIRMED') { failure = `unexpected_state_${state.status || 'unknown'}`; break; }
          }
          const res = await cancelTbankPayment({ paymentId });
          if (!res.ok || res.status !== 'REFUNDED') {
            failure = !res.ok ? res.error || 'cancel_failed' : `cancel_status_${res.status || 'missing'}`;
            break;
          }
          await markPaymentRefunded(id, operationId, paymentId);
        }
      }
      if (failure) {
        await failPaymentOperation(id, operationId, failure);
        recordAdminAudit('refund_payment', ip, id, `error:${failure}`);
        throw new CheckoutError('Банк не подтвердил полный возврат. Проверьте кабинет Т-Банка; заказ не отменён, повторную операцию нужно подтвердить отдельно.', 502);
      }
      const updated = await completePaymentRefund(id, operationId);
      if (!updated) {
        await failPaymentOperation(id, operationId, 'refund_targets_changed');
        recordAdminAudit('refund_payment', ip, id, 'error:refund_targets_changed');
        throw new CheckoutError('Возврат не завершён: список платежей изменился. Проверьте заказ и кабинет банка.', 409);
      }
      recordAdminAudit('refund_payment', ip, id, 'ok');
      await syncOrderToOneC(updated);
      return NextResponse.json({ order: updated });
    }
    if (body.action === 'closing-receipt') {
      const retryConfirmed = retryConfirmedOf(body);
      const markCodes = markCodesOf(body, existing);
      const claim = await claimPaymentOperation(id, 'closing_receipt', retryConfirmed, markCodes);
      if (claim.state === 'missing') return NextResponse.json({ error: 'Заказ не найден.' }, { status: 404 });
      if (claim.state === 'done') return NextResponse.json({ order: claim.order });
      if (claim.state === 'busy') throw new OrderConflict(`Чек уже отправляется. Повторите через ${claim.retryAfterSeconds} с.`);
      if (claim.state === 'confirmation-required') throw new OrderConflict('Результат предыдущей отправки чека не подтверждён. Проверьте кабинет Т-Банка и повторите действие с подтверждением.');
      const operationId = claim.operationId;
      const paymentId = paidPaymentIdOf(claim.order);
      if (!paymentId) throw new OrderConflict('У заказа нет подтверждённого платежа.');
      if (!await touchPaymentOperation(id, operationId)) throw new OrderConflict('Чек уже отправляется другим запросом.');
      let res: Awaited<ReturnType<typeof sendTbankClosingReceipt>>;
      try {
        res = await sendTbankClosingReceipt({
          paymentId,
          customerPhone: claim.order.customer.phone,
          items: claim.order.items,
          amountRub: claim.order.total!,
          markCodes: claim.order.paymentOperation?.markCodes,
        });
      } catch (error) {
        await failPaymentOperation(id, operationId, 'closing_receipt_unavailable');
        throw error;
      }
      if (!res.ok) {
        await failPaymentOperation(id, operationId, res.error || 'closing_receipt_failed');
        recordAdminAudit('closing_receipt', ip, id, `error:${res.error || 'closing_receipt_failed'}`);
        throw new CheckoutError(res.error || 'Не удалось отправить закрывающий чек ФФД 1.2.', 502);
      }
      const updated = await completeClosingReceipt(id, operationId);
      if (!updated) {
        await failPaymentOperation(id, operationId, 'closing_receipt_not_recorded');
        recordAdminAudit('closing_receipt', ip, id, 'error:closing_receipt_not_recorded');
        throw new CheckoutError('Банк принял чек, но результат не записан. Проверьте кабинет Т-Банка перед повторной отправкой.', 409);
      }
      recordAdminAudit('closing_receipt', ip, id, `paymentId=${paymentId}`);
      return NextResponse.json({ order: updated });
    }
    if (body.action === 'cancel') {
      const updated = await mutateOrder(id, (order) => {
        if (order.status === 'paid') throw new OrderConflict('Оплаченный заказ нельзя отменить здесь. Возврат выполняется через банк.');
        if (!order.demo && activePaymentIdsOf(order).length) throw new OrderConflict('Сначала отмените платёж в кабинете банка. До подтверждения банка резерв не снимается.');
        order.status = 'cancelled';
      });
      recordAdminAudit('cancel_order', ip, id);
      if (updated) await syncOrderToOneC(updated);
      return NextResponse.json({ order: updated });
    }
    return NextResponse.json({ error: 'Неизвестное действие.' }, { status: 400 });
  } catch (error) {
    if (error instanceof CheckoutError) {
      if (error.status >= 500) logServerError('order-update', error);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof OrderConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    logServerError('order-update', error);
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
  const order = await getAuthorizedOrder(id, token, clientAddress(req.headers));
  if (!order) return NextResponse.json({ error: 'Заказ не найден.' }, { status: 404 });
  try {
    if (body.action === 'retry-payment') {
      const limited = guardAttempts('payment-retry', req.headers, 10, 60000);
      if (limited) return limited;
      const updated = await initializeOrderPayment(id, process.env.SHOP_URL || req.nextUrl.origin);
      return NextResponse.json({ ok: Boolean(updated?.paymentUrl && !updated.paymentError) });
    }
    if (body.action === 'sbp-qr') {
      const limited = guardAttempts('payment-retry', req.headers, 10, 60000);
      if (limited) return limited;
      const updated = await ensureOrderSbpQr(id, process.env.SHOP_URL || req.nextUrl.origin);
      return NextResponse.json({ ok: Boolean(updated?.sbpQrSvg || updated?.sbpPayloadUrl) });
    }
    if (body.action !== 'demo-pay' || !isDemoMode() || !order.demo || !order.paymentId?.startsWith('DEMO-')) return NextResponse.json({ error: 'Демо-оплата недоступна.' }, { status: 403 });
    await mutateOrder(id, (current) => {
      if (current.status === 'paid') return;
      if (current.status !== 'awaiting_payment') throw new OrderConflict('Заказ ещё не готов к оплате.');
      current.status = 'paid';
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof OrderConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    logServerError('order-payment', error);
    return NextResponse.json({ error: 'Оплата временно недоступна.' }, { status: 503 });
  }
}
