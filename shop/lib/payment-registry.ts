import { Order, PaymentState } from './types';

const TERMINAL_PAYMENT_STATES = new Set<PaymentState>(['cancelled', 'rejected', 'expired', 'refunded']);

export function paymentStateIsTerminal(state: PaymentState | undefined): boolean {
  return state !== undefined && TERMINAL_PAYMENT_STATES.has(state);
}

/**
 * Все платёжные id заказа: реестр выдач плюс ведущий id. Заказы, записанные до появления
 * реестра, знают только paymentId, и их оплата примиряется по-прежнему. Модуль без базы
 * данных и без side-эффектов: та же проверка нужна и панели администратора на клиенте.
 */
export function paymentIdsOf(order: Pick<Order, 'paymentId' | 'paymentIds'>): string[] {
  return [...new Set([...(order.paymentIds ?? []), ...(order.paymentId ? [order.paymentId] : [])])];
}

export function activePaymentIdsOf(order: Pick<Order, 'paymentId' | 'paymentIds' | 'paymentStates'>): string[] {
  return paymentIdsOf(order).filter((paymentId) => !paymentStateIsTerminal(order.paymentStates?.[paymentId]));
}
