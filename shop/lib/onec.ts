import { Order } from './types';

// =========================================================================
// ИНТЕГРАЦИЯ 1С:УНФ 3.0 — отправка заказа и статуса оплаты.
// Боевой режим: ONEC_API_URL = https://ваша-база/hs/shop/v1 (HTTP-сервис УНФ),
// ONEC_TOKEN = базовая авторизация или Bearer.
// Спецификация обмена для 1С-ника: README раздел «Обмен с 1С».
// Без переменных окружения работает мок-режим (console.log).
// =========================================================================

export async function pushOrderToOneC(order: Order): Promise<{ ok: boolean; mock?: boolean; error?: string }> {
  const url = process.env.ONEC_API_URL;
  if (!url) {
    console.log('[1C MOCK] Заказ передан в УНФ:', JSON.stringify({
      id: order.id,
      customer: order.customer,
      items: order.items.map((i) => ({ product: i.productId, label: i.label, price: i.price, pieceId1c: i.pieceId1c })),
      total: order.total,
      delivery: order.delivery,
    }));
    return { ok: true, mock: true };
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ONEC_TOKEN ? { Authorization: `Bearer ${process.env.ONEC_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        id: order.id,
        createdAt: order.createdAt,
        customer: order.customer,
        delivery: order.delivery,
        items: order.items.map((i) => ({
          productId: i.productId,
          label: i.label,
          weightG: i.weightG,
          price: i.price,
          qty: i.qty,
          pieceId1c: i.pieceId1c,
        })),
        total: order.total,
      }),
    });
    if (!res.ok) throw new Error(`1C responded ${res.status}`);
    return { ok: true };
  } catch (e) {
    console.error('1C push failed:', e);
    return { ok: false, error: String(e) };
  }
}

// Отправка ссылки на оплату клиенту в мессенджер (мок; боевой: WhatsApp Business API / SMS-шлюз)
export async function sendPaymentLink(order: Order): Promise<{ ok: boolean; mock?: boolean }> {
  const text = `Заказ ${order.id}: ссылка на оплату ${order.total}\u00A0₽ - ${order.paymentUrl}`;
  console.log(`[MESSENGER MOCK → ${order.messenger}] ${text}`);
  // TODO ИНТЕГРАЦИЯ: WhatsApp Cloud API / SMS-шлюз (переменные WA_TOKEN, SMS_API_KEY)
  return { ok: true, mock: true };
}
