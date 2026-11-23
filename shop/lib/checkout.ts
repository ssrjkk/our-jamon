import { isDemoMode } from './config';
import { resolveDelivery } from './delivery';
import { getProducts } from './products';
import { getOrder, mutateOrder, OrderConflict, reservedPieceIds, resolveCart } from './orders';
import { paymentIdsOf, paymentStateIsTerminal } from './payment-registry';
import { createTbankPayment, fetchTbankSbpQr } from './tbank';
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
    if (order.paymentMethod === 'pay_on_pickup') return;
    if (order.status !== 'awaiting_payment' || order.total === null || order.delivery.cost === null
      || order.items.some((item) => item.requiresWeightCheck && !item.weightConfirmed)) throw new OrderConflict('Сначала нужно согласовать вес и доставку.');
    if (order.paymentUrl && !order.paymentError && !(order.paymentId && paymentStateIsTerminal(order.paymentStates?.[order.paymentId]))) return;
    if (order.paymentInitAt && Date.now() - Date.parse(order.paymentInitAt) < 60000) throw new OrderConflict('Ссылка на оплату уже формируется. Повторите чуть позже.');
    order.paymentInitAt = attempt;
    start = true;
  });
  if (!pending || !start) return pending;
  const payment = await createTbankPayment({
    orderId: pending.id,
    accessToken: pending.accessToken,
    amountRub: pending.total!,
    items: pending.items,
    description: `Заказ ${pending.id} · Наш Хамон`,
    customerPhone: pending.customer.phone,
    baseUrl,
    paymentMethod: pending.paymentMethod ?? 'card',
  });
  await mutateOrder(id, (order) => {
    if (order.status !== 'awaiting_payment') return;
    if (payment.paymentId) {
      if (!paymentIdsOf(order).includes(payment.paymentId)) order.paymentIds = [...(order.paymentIds ?? []), payment.paymentId];
      if (!order.paymentStates?.[payment.paymentId]) order.paymentStates = { ...order.paymentStates, [payment.paymentId]: 'pending' };
    }
    if (order.paymentInitAt !== attempt) return;
    order.paymentInitAt = undefined;
    const terminal = payment.paymentId ? paymentStateIsTerminal(order.paymentStates?.[payment.paymentId]) : false;
    order.paymentError = !payment.ok || terminal;
    if (payment.ok && payment.paymentId && !terminal) {
      order.paymentId = payment.paymentId;
      order.paymentUrl = payment.paymentUrl;
      if (payment.sbpPayloadUrl) order.sbpPayloadUrl = payment.sbpPayloadUrl;
      if (payment.sbpQrSvg) order.sbpQrSvg = payment.sbpQrSvg;
    } else if (payment.paymentId && terminal) {
      order.paymentId = undefined;
      order.paymentUrl = undefined;
      order.sbpPayloadUrl = undefined;
      order.sbpQrSvg = undefined;
    }
  });
  return getOrder(id);
}

export async function ensureOrderSbpQr(id: string, baseUrl: string): Promise<Order | undefined> {
  let order = await getOrder(id);
  if (!order) return undefined;
  if (order.paymentMethod === 'pay_on_pickup') throw new OrderConflict('Для заказа с оплатой при получении QR СБП не требуется.');
  if (order.status !== 'awaiting_payment') throw new OrderConflict('Заказ ещё не готов к оплате или уже закрыт.');
  if (order.sbpQrSvg && order.sbpPayloadUrl) return order;
  if (!order.paymentId) {
    order = await initializeOrderPayment(id, baseUrl);
    if (!order?.paymentId) return order;
    if (order.sbpQrSvg && order.sbpPayloadUrl) return order;
  }
  const paymentId = order.paymentId;
  const qr = await fetchTbankSbpQr(paymentId);
  if (!qr.ok) return getOrder(id);
  return mutateOrder(id, (current) => {
    if (current.status !== 'awaiting_payment' || current.paymentId !== paymentId || paymentStateIsTerminal(current.paymentStates?.[paymentId])) return;
    if (qr.sbpPayloadUrl) current.sbpPayloadUrl = qr.sbpPayloadUrl;
    if (qr.sbpQrSvg) current.sbpQrSvg = qr.sbpQrSvg;
  });
}
