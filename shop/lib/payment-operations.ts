import crypto from 'node:crypto';
import { mutateOrder, OrderConflict } from './orders';
import { Order, PaymentOperation } from './types';

export const PAYMENT_OPERATION_LEASE_MS = 2 * 60 * 1000;

export type PaymentOperationKind = PaymentOperation['kind'];

export type PaymentOperationClaim =
  | { state: 'claimed'; order: Order; operationId: string }
  | { state: 'busy'; retryAfterSeconds: number }
  | { state: 'confirmation-required'; order: Order }
  | { state: 'done'; order: Order }
  | { state: 'missing' };

export function paidPaymentIdOf(order: Pick<Order, 'status' | 'paidPaymentId' | 'paymentId'>): string | undefined {
  return order.paidPaymentId ?? (order.status === 'paid' ? order.paymentId : undefined);
}

export function refundTargetsOf(order: Order): string[] {
  const accounted = paidPaymentIdOf(order);
  return [...new Set([...(accounted ? [accounted] : []), ...(order.refundPaymentIds ?? [])])]
    .filter((paymentId) => paymentId && !order.refundedPaymentIds?.includes(paymentId));
}

export async function claimPaymentOperation(
  id: string,
  kind: PaymentOperationKind,
  retryConfirmed: boolean,
  markCodes?: Record<string, string[]>,
  now = Date.now(),
): Promise<PaymentOperationClaim> {
  let outcome: PaymentOperationClaim = { state: 'missing' };
  const order = await mutateOrder(id, (current) => {
    const previous = current.paymentOperation;
    if (kind === 'refund') {
      if (current.paymentMethod === 'pay_on_pickup') throw new OrderConflict('Для оплаты при получении возврат через Т-Банк недоступен.');
      if (current.status !== 'paid' && current.status !== 'cancelled') throw new OrderConflict('Возврат доступен только для оплаченного заказа.');
      if (current.status === 'cancelled' && refundTargetsOf(current).length === 0) {
        outcome = { state: 'done', order: current };
        return;
      }
    } else {
      if (current.paymentMethod === 'pay_on_pickup') throw new OrderConflict('Для оплаты при получении закрывающий чек Т-Банка не формируется.');
      if (current.status !== 'paid' || !paidPaymentIdOf(current) || current.total === null) {
        throw new OrderConflict('Закрывающий чек ФФД 1.2 отправляется только после подтверждённой оплаты.');
      }
      if (current.closingReceiptSentAt) {
        outcome = { state: 'done', order: current };
        return;
      }
    }
    if (previous?.state === 'running' && now - Date.parse(previous.startedAt) < PAYMENT_OPERATION_LEASE_MS) {
      outcome = { state: 'busy', retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(previous.startedAt) + PAYMENT_OPERATION_LEASE_MS - now) / 1000)) };
      return;
    }
    if (previous && previous.kind !== kind && (previous.state === 'needs_attention' || previous.state === 'running')) {
      outcome = { state: 'confirmation-required', order: current };
      return;
    }
    if (previous?.kind === kind && (previous.state === 'needs_attention' || previous.state === 'running') && !retryConfirmed) {
      outcome = { state: 'confirmation-required', order: current };
      return;
    }
    const operation: PaymentOperation = {
      id: crypto.randomUUID(),
      kind,
      state: 'running',
      startedAt: new Date(now).toISOString(),
      attempt: previous?.kind === kind ? previous.attempt + 1 : 1,
      ...(kind === 'closing_receipt' && (markCodes ?? previous?.markCodes) ? { markCodes: markCodes ?? previous?.markCodes } : {}),
    };
    current.paymentOperation = operation;
    outcome = { state: 'claimed', order: current, operationId: operation.id };
  });
  return order ? outcome : { state: 'missing' };
}

export async function touchPaymentOperation(id: string, operationId: string): Promise<boolean> {
  let active = false;
  await mutateOrder(id, (order) => {
    if (order.paymentOperation?.id !== operationId || order.paymentOperation.state !== 'running') return;
    order.paymentOperation.startedAt = new Date().toISOString();
    active = true;
  });
  return active;
}

export async function markPaymentRefunded(id: string, operationId: string, paymentId: string): Promise<void> {
  await mutateOrder(id, (order) => {
    if (order.paymentOperation?.id !== operationId || order.paymentOperation.state !== 'running') return;
    order.refundedPaymentIds = [...new Set([...(order.refundedPaymentIds ?? []), paymentId])];
  });
}

export async function failPaymentOperation(id: string, operationId: string, error: string): Promise<Order | undefined> {
  return mutateOrder(id, (order) => {
    if (order.paymentOperation?.id !== operationId || order.paymentOperation.state !== 'running') return;
    order.paymentOperation.state = 'needs_attention';
    order.paymentOperation.finishedAt = new Date().toISOString();
    order.paymentOperation.error = error.slice(0, 200);
  });
}

export async function completePaymentRefund(id: string, operationId: string): Promise<Order | undefined> {
  return mutateOrder(id, (order) => {
    if (order.paymentOperation?.id !== operationId || order.paymentOperation.state !== 'running' || refundTargetsOf(order).length > 0) return undefined;
    order.status = 'cancelled';
    order.paymentOperation.state = 'succeeded';
    order.paymentOperation.finishedAt = new Date().toISOString();
    order.paymentOperation.error = undefined;
  });
}

export async function completeClosingReceipt(id: string, operationId: string): Promise<Order | undefined> {
  return mutateOrder(id, (order) => {
    if (order.paymentOperation?.id !== operationId || order.paymentOperation.state !== 'running' || order.status !== 'paid') return undefined;
    order.closingReceiptSentAt = new Date().toISOString();
    order.paymentOperation.state = 'succeeded';
    order.paymentOperation.finishedAt = new Date().toISOString();
    order.paymentOperation.error = undefined;
  });
}
