import { isDemoMode } from './config';
import { mutateOrder } from './orders';
import { Order } from './types';

export async function pushOrderToOneC(order: Order): Promise<{ ok: boolean; demo?: boolean; error?: string }> {
  if (isDemoMode()) return { ok: true, demo: true };
  const url = process.env.ONEC_API_URL;
  if (!url) return { ok: false, error: 'one_c_not_configured' };
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.ONEC_TOKEN ? { Authorization: `Bearer ${process.env.ONEC_TOKEN}` } : {}) },
      body: JSON.stringify({ id: order.id, createdAt: order.createdAt, customer: order.customer, delivery: order.delivery, items: order.items, itemsSum: order.itemsSum, total: order.total, status: order.status, paymentId: order.paymentId }),
      signal: AbortSignal.timeout(10000),
    });
    return response.ok ? { ok: true } : { ok: false, error: `one_c_http_${response.status}` };
  } catch {
    return { ok: false, error: 'one_c_unavailable' };
  }
}

export async function syncOrderToOneC(order: Order): Promise<boolean> {
  const result = await pushOrderToOneC(order);
  if (!result.demo) {
    await mutateOrder(order.id, (current) => {
      if (current.status === order.status && current.total === order.total) {
        current.onecSyncedAt = result.ok ? new Date().toISOString() : undefined;
        current.onecSyncError = result.error;
      }
    });
  }
  return result.ok;
}
