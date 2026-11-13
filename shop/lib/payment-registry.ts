import { Order } from './types';

/**
 * Все платёжные id заказа: реестр выдач плюс ведущий id. Заказы, записанные до появления
 * реестра, знают только paymentId, и их оплата примиряется по-прежнему. Модуль без базы
 * данных и без side-эффектов: та же проверка нужна и панели администратора на клиенте.
 */
export function paymentIdsOf(order: Pick<Order, 'paymentId' | 'paymentIds'>): string[] {
  return [...new Set([...(order.paymentIds ?? []), ...(order.paymentId ? [order.paymentId] : [])])];
}
