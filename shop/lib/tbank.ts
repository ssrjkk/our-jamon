import crypto from 'crypto';

// =========================================================================
// ИНТЕГРАЦИЯ Т-БАНК ЭКВАЙРИНГ (EACQ API)
// https://www.tbank.ru/docs/ - Init + Notification.
// Без TBANK_TERMINAL_KEY работает мок-режим: возвращаем заглушку ссылки.
// Боевой режим: POST https://securepay.tinkoff.ru/v2/Init
//   { TerminalKey, Amount(копейки), OrderId, Description, SuccessURL, FailURL,
//     NotificationURL, DATA:{ Email, Phone } }
//   → { PaymentId, PaymentURL }
// Webhook /api/tbank/notify проверяет Token = sha256(пары значений + Password).
// =========================================================================

const TBANK_INIT_URL = 'https://securepay.tinkoff.ru/v2/Init';

export interface PaymentResult {
  ok: boolean;
  paymentUrl?: string;
  paymentId?: string;
  mock?: boolean;
  error?: string;
}

export async function createTbankPayment(opts: {
  orderId: string;
  amountRub: number;
  description: string;
  customerPhone: string;
  baseUrl: string;
}): Promise<PaymentResult> {
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  const password = process.env.TBANK_PASSWORD;
  const amountKop = Math.round(opts.amountRub * 100);

  if (!terminalKey || !password) {
    // Мок-режим для разработки: «платёжная страница» внутри магазина
    return {
      ok: true,
      mock: true,
      paymentId: 'MOCK-' + Date.now(),
      paymentUrl: `${opts.baseUrl}/order/${opts.orderId}?mockpay=1`,
    };
  }

  try {
    const res = await fetch(TBANK_INIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        TerminalKey: terminalKey,
        Amount: amountKop,
        OrderId: opts.orderId,
        Description: opts.description,
        SuccessURL: `${opts.baseUrl}/order/${opts.orderId}?paid=1`,
        FailURL: `${opts.baseUrl}/order/${opts.orderId}?fail=1`,
        NotificationURL: `${opts.baseUrl}/api/tbank/notify`,
        DATA: { Phone: opts.customerPhone.replace(/\D/g, '') },
      }),
    });
    const data = (await res.json()) as { Success?: boolean; PaymentURL?: string; PaymentId?: string; Message?: string; Details?: string };
    if (!data.Success || !data.PaymentURL) {
      return { ok: false, error: data.Details || data.Message || 'T-Bank Init failed' };
    }
    return { ok: true, paymentUrl: data.PaymentURL, paymentId: String(data.PaymentId) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Проверка подписи уведомления Т-Банка: Token = sha256 от значений, отсортированных по ключу, + Password */
export function verifyTbankNotification(body: Record<string, string>): boolean {
  const password = process.env.TBANK_PASSWORD;
  if (!password) return true; // мок-режим: принимаем всё
  const entries = Object.entries(body)
    .filter(([k, v]) => k !== 'Token' && k !== 'Receipt' && v !== null && typeof v !== 'object')
    .sort(([a], [b]) => a.localeCompare(b));
  const concat = entries.map(([, v]) => v).join('') + password;
  const expected = crypto.createHash('sha256').update(concat).digest('hex');
  return expected === body.Token;
}
