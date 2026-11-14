import crypto from 'node:crypto';
import { equalSecrets } from './admin';
import { isDemoMode } from './config';
import { logServerError } from './server-log';
import { CartItemResolved } from './types';

const TBANK_INIT_URL = 'https://securepay.tinkoff.ru/v2/Init';

export interface PaymentResult {
  ok: boolean;
  paymentUrl?: string;
  paymentId?: string;
  demo?: boolean;
  error?: string;
}

export function tbankToken(body: Record<string, unknown>, password: string): string {
  const values = Object.entries({ ...body, Password: password })
    .filter(([key, value]) => key !== 'Token' && value !== null && value !== undefined && typeof value !== 'object')
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([, value]) => String(value));
  return crypto.createHash('sha256').update(values.join('')).digest('hex');
}

export async function createTbankPayment(options: {
  orderId: string;
  accessToken: string;
  amountRub: number;
  items: CartItemResolved[];
  description: string;
  customerPhone: string;
  baseUrl: string;
}): Promise<PaymentResult> {
  if (!Number.isSafeInteger(options.amountRub) || options.amountRub <= 0 || !Number.isSafeInteger(options.amountRub * 100)) return { ok: false, error: 'invalid_amount' };
  const statusUrl = `${options.baseUrl.replace(/\/$/, '')}/order/${encodeURIComponent(options.orderId)}?token=${options.accessToken}`;
  if (isDemoMode()) return { ok: true, demo: true, paymentId: 'DEMO-' + crypto.randomUUID(), paymentUrl: statusUrl };
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  const password = process.env.TBANK_PASSWORD;
  const taxation = process.env.TBANK_TAXATION;
  const tax = process.env.TBANK_VAT;
  if (!terminalKey || !password || !taxation || !tax || !process.env.SHOP_URL || !/^https:\/\//.test(process.env.SHOP_URL)) return { ok: false, error: 'payment_not_configured' };
  const payload: Record<string, unknown> = {
    TerminalKey: terminalKey,
    Amount: options.amountRub * 100,
    OrderId: options.orderId,
    Description: options.description,
    SuccessURL: statusUrl,
    FailURL: statusUrl,
    NotificationURL: `${options.baseUrl.replace(/\/$/, '')}/api/tbank/notify`,
    DATA: { Phone: options.customerPhone.replace(/\D/g, '') },
    Receipt: {
      Phone: options.customerPhone.replace(/\D/g, ''),
      Taxation: taxation,
      Items: [
        ...options.items.map((item) => ({ Name: item.title.slice(0, 128), Price: item.price * 100, Quantity: item.qty, Amount: item.price * item.qty * 100, Tax: tax, PaymentMethod: 'full_prepayment', PaymentObject: 'commodity' })),
        ...(options.amountRub > options.items.reduce((sum, item) => sum + item.price * item.qty, 0)
          ? [{ Name: 'Доставка', Price: (options.amountRub - options.items.reduce((sum, item) => sum + item.price * item.qty, 0)) * 100, Quantity: 1, Amount: (options.amountRub - options.items.reduce((sum, item) => sum + item.price * item.qty, 0)) * 100, Tax: tax, PaymentMethod: 'full_prepayment', PaymentObject: 'service' }]
          : []),
      ],
    },
  };
  payload.Token = tbankToken(payload, password);
  try {
    const response = await fetch(TBANK_INIT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
    const data: unknown = await response.json();
    // PaymentId выписан банком ещё до того, как мы успели проверить ответ: если платформа
    // вернула ошибку или URL оказался непригоден, платёж всё равно мог существовать.
    // Выбросив этот id, магазин терял единственный способ принять оплату по такой ссылке.
    const reported = data && typeof data === 'object' && 'PaymentId' in data
      && ['string', 'number'].includes(typeof (data as { PaymentId?: unknown }).PaymentId)
      ? String((data as { PaymentId: string | number }).PaymentId).trim() : '';
    if (!response.ok || !data || typeof data !== 'object' || !('Success' in data) || data.Success !== true
      || !('PaymentURL' in data) || typeof data.PaymentURL !== 'string' || !/^https:\/\//.test(data.PaymentURL)
      || !('PaymentId' in data) || !['string', 'number'].includes(typeof data.PaymentId)) return { ok: false, error: 'payment_unavailable', ...(reported ? { paymentId: reported } : {}) };
    return { ok: true, paymentUrl: data.PaymentURL, paymentId: String(data.PaymentId) };
  } catch (error) {
    // Банк не отвечал, TLS встал или таймаут истёк — покупатель видит один и тот же
    // отказ, поэтому различие сохраняется только в журнале сервера.
    logServerError('tbank-init', error);
    return { ok: false, error: 'payment_unavailable' };
  }
}

export function verifyTbankNotification(body: Record<string, unknown>): boolean {
  const password = process.env.TBANK_PASSWORD;
  if (isDemoMode() || !password || !process.env.TBANK_TERMINAL_KEY || body.TerminalKey !== process.env.TBANK_TERMINAL_KEY
    || typeof body.Token !== 'string' || !/^[a-fA-F0-9]{64}$/.test(body.Token)) return false;
  return equalSecrets(tbankToken(body, password), body.Token.toLowerCase());
}
