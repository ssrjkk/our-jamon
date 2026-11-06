import { NextRequest, NextResponse } from 'next/server';
import { CartItemInput, DeliveryOption, Order } from '@/lib/types';
import { resolveCart, saveOrder, readOrders, generateOrderId, reservedPieceIds } from '@/lib/orders';
import { createTbankPayment } from '@/lib/tbank';
import { pushOrderToOneC } from '@/lib/onec';
import { isAdmin } from '@/lib/admin';

// ЗАМЕНИТЬ: порог бесплатной доставки курьером по СПб - согласовать с Виталием
const FREE_DELIVERY_FROM = Number(process.env.FREE_DELIVERY_FROM || 3000);

const DELIVERY: Record<string, DeliveryOption> = {
  cdek: { id: 'cdek', name: 'СДЭК (ПВЗ)', cost: 290, note: 'Пункты выдачи по СПб и России [заглушка тарифов]' },
  yandex: { id: 'yandex', name: 'Яндекс Доставка', cost: 350, note: 'Курьер до двери по СПб [заглушка тарифов]' },
  drivee: { id: 'drivee', name: 'Drivee Курьер', cost: 300, note: 'Курьер до двери по СПб [заглушка тарифов]' },
  pickup: { id: 'pickup', name: 'Самовывоз', cost: 0, note: 'Сытнинская ул., 4П, вт-вс 10:30-20:30' },
};

export async function POST(req: NextRequest) {
  let body: {
    customer?: { name?: string; phone?: string };
    deliveryId?: string;
    deliveryAddress?: string;
    messenger?: Order['messenger'];
    items?: CartItemInput[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const name = (body.customer?.name || '').trim();
  const rawPhone = (body.customer?.phone || '').trim();
  const phoneDigits = rawPhone.replace(/\D/g, '');
  if (!name) return NextResponse.json({ error: 'Укажите ваше имя' }, { status: 400 });
  if (phoneDigits.length !== 11) return NextResponse.json({ error: 'Введите полный номер телефона с кодом оператора' }, { status: 400 });
  const phone = rawPhone;

  const deliveryId = body.deliveryId && DELIVERY[body.deliveryId] ? body.deliveryId : 'cdek';
  const delivery = DELIVERY[deliveryId];

  const reserved = await reservedPieceIds();
  const resolved = resolveCart(body.items || [], reserved);
  if (!resolved.ok || !resolved.items || resolved.itemsSum === undefined) {
    return NextResponse.json({ error: resolved.error || 'Не удалось собрать заказ' }, { status: 409 });
  }

  // Бесплатная доставка курьером по СПб от порога (СДЭК и самовывоз не меняются)
  let deliveryCost = delivery.cost;
  if ((deliveryId === 'yandex' || deliveryId === 'drivee') && resolved.itemsSum >= FREE_DELIVERY_FROM) {
    deliveryCost = 0;
  }

  const orderId = generateOrderId();
  const baseUrl = process.env.SHOP_URL || req.nextUrl.origin;
  const order: Order = {
    id: orderId,
    createdAt: new Date().toISOString(),
    customer: { name, phone },
    delivery: { id: deliveryId, name: delivery.name, cost: deliveryCost, address: body.deliveryAddress },
    messenger: body.messenger || 'Telegram',
    items: resolved.items,
    itemsSum: resolved.itemsSum,
    total: resolved.itemsSum + deliveryCost,
    status: 'awaiting_weight',
  };

  // Два сценария оплаты: только фасовка - сразу Т-Банк; есть весовое - ждём подтверждения веса
  if (!resolved.hasWeightCheck) {
    const payment = await createTbankPayment({
      orderId,
      amountRub: order.total,
      description: `Заказ ${orderId} - Наш Хамон`,
      customerPhone: order.customer.phone,
      baseUrl,
    });
    if (!payment.ok) {
      return NextResponse.json({ error: 'Платёжный шлюз недоступен: ' + payment.error }, { status: 502 });
    }
    order.status = 'awaiting_payment';
    order.paymentUrl = payment.paymentUrl;
    order.paymentId = payment.paymentId;
  }

  await saveOrder(order);
  await pushOrderToOneC(order);

  return NextResponse.json({
    orderId: order.id,
    status: order.status,
    paymentUrl: order.paymentUrl || null,
    total: order.total,
  }, { status: 201 });
}

// GET /api/orders — список заказов (только админ)
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Требуется авторизация администратора' }, { status: 401 });
  }
  const orders = await readOrders();
  return NextResponse.json({ orders });
}
