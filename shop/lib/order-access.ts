import { cookies } from 'next/headers';
import { equalSecrets, isAdmin } from './admin';
import { getOrder } from './orders';
import { Order } from './types';

export function orderCookieName(id: string): string {
  return `nh_order_${id}`;
}

export async function getAuthorizedOrder(id: string, token?: string | null): Promise<Order | undefined> {
  const order = await getOrder(id);
  if (!order) return undefined;
  const cookie = (await cookies()).get(orderCookieName(id))?.value;
  if ((typeof token === 'string' && equalSecrets(token, order.accessToken)) || (cookie && equalSecrets(cookie, order.accessToken)) || await isAdmin()) return order;
  return undefined;
}
