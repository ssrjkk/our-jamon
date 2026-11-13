import { isDemoMode } from './config';
import { resolveDelivery } from './delivery';
import { getProducts } from './products';
import { getOrder, mutateOrder, OrderConflict, reservedPieceIds, resolveCart } from './orders';
import { paymentIdsOf } from './payment-registry';
import { createTbankPayment } from './tbank';
import { CartQuote, Order } from './types';

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function quoteCart(items: unknown, deliveryId: unknown, address?: string): Promise<CartQuote> {
  if (typeof deliveryId !== 'string') throw new CheckoutError('Выберите способ получения заказа.');
  let products;
  try { products = await getProducts(); }
  catch { throw new CheckoutError('Каталог временно недоступен. Попробуйте позже или свяжитесь с лавкой.', 503); }
  const resolved = resolveCart(items, await reservedPieceIds(), products);
  if (!resolved.ok || !resolved.items || resolved.itemsSum === undefined) throw new CheckoutError(resolved.error || 'Не удалось рассчитать корзину.', 409);
  const delivery = resolveDelivery(deliveryId, resolved.itemsSum, address);
  if (!delivery) throw new CheckoutError('Выберите доступный способ получения заказа.');
  if (delivery.cost !== null && !Number.isSafeInteger(resolved.itemsSum + delivery.cost)) throw new CheckoutError('Не удалось рассчитать итоговую сумму.');
  return {
    items: resolved.items,
    itemsSum: resolved.itemsSum,
    delivery,
    total: delivery.cost === null ? null : resolved.itemsSum + delivery.cost,
    needsConfirmation: Boolean(resolved.hasWeightCheck || delivery.cost === null),
    demo: isDemoMode(),
  };
}

export async function initializeOrderPayment(id: string, baseUrl: string): Promise<Order | undefined> {
  let start = false;
  const attempt = new Date().toISOString();
  const pending = await mutateOrder(id, (order) => {
    if (order.demo !== isDemoMode()) throw new OrderConflict('Этот заказ создан в другом режиме магазина. Свяжитесь с лавкой.');
    if (order.status !== 'awaiting_payment' || order.total === null || order.delivery.cost === null
      || order.items.some((item) => item.requiresWeightCheck && !item.weightConfirmed)) throw new OrderConflict('Сначала нужно согласовать вес и доставку.');
    if (order.paymentUrl && !order.paymentError) return;
    if (order.paymentInitAt && Date.now() - Date.parse(order.paymentInitAt) < 60000) throw new OrderConflict('Ссылка на оплату уже формируется. Повторите чуть позже.');
    order.paymentInitAt = attempt;
    start = true;
  });
  if (!pending || !start) return pending;
  const payment = await createTbankPayment({ orderId: pending.id, accessToken: pending.accessToken, amountRub: pending.total!, items: pending.items, description: `Заказ ${pending.id} · Наш Хамон`, customerPhone: pending.customer.phone, baseUrl });
  await mutateOrder(id, (order) => {
    if (order.status !== 'awaiting_payment') return;
    // id попадает в реестр до того, как мы решим, удалась ли выдача и не устарела ли попытка:
    // платёж, о котором банк сообщил даже в ошибочном или запоздалом ответе, позже обязан
    // быть принят уведомлением. Ведущей ссылкой остаётся только ответ той же попытки.
    if (payment.paymentId && !paymentIdsOf(order).includes(payment.paymentId)) {
      order.paymentIds = [...(order.paymentIds ?? []), payment.paymentId];
    }
    if (order.paymentInitAt !== attempt) return;
    order.paymentInitAt = undefined;
    order.paymentError = !payment.ok;
    if (payment.ok) {
      order.paymentId = payment.paymentId;
      order.paymentUrl = payment.paymentUrl;
    }
  });
  return getOrder(id);
}
