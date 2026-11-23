import crypto from 'node:crypto';
import { equalSecrets } from './admin';
import { isDemoMode } from './config';
import { PRODUCTS } from './products';
import { logServerError } from './server-log';
import { CartItemResolved, PaymentMethod } from './types';

const TBANK_API_BASE = 'https://securepay.tinkoff.ru/v2';
const TBANK_INIT_URL = `${TBANK_API_BASE}/Init`;
const TBANK_CLOSING_RECEIPT_URL = 'https://securepay.tinkoff.ru/cashbox/SendClosingReceipt';
const VALID_VAT_CODES = new Set(['none', 'vat0', 'vat5', 'vat7', 'vat10', 'vat20', 'vat22']);

export interface PaymentResult {
  ok: boolean;
  paymentUrl?: string;
  paymentId?: string;
  sbpPayloadUrl?: string;
  sbpQrSvg?: string;
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

function receiptPhoneOf(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^8(\d{10})$/, '7$1');
  return digits.startsWith('7') && digits.length === 11 ? `+${digits}` : digits;
}

function taxForItem(productId: string, configuredVat: string): string {
  if (configuredVat === 'vat22') {
    const product = PRODUCTS.find((candidate) => candidate.id === productId);
    if (product?.category === 'cheese') return 'vat10';
  }
  return configuredVat;
}

function safeSbpPayloadUrl(raw: string): string {
  if (raw.length > 2048) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch {
    return '';
  }
}

function safeSbpSvg(raw: string): string {
  const svg = raw.trim().replace(/^<\?xml[^?]*\?>\s*/i, '');
  if (!svg || svg.length > 65536 || !/^<svg(?:\s[^>]*)?>[\s\S]*<\/svg>$/i.test(svg) || /<!--|<\!|\?/.test(svg)) return '';
  const allowedTags = new Set(['svg', 'g', 'defs', 'lineargradient', 'radialgradient', 'stop', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'clippath', 'mask']);
  for (const match of svg.matchAll(/<\s*\/?\s*([a-z][\w:-]*)/gi)) {
    if (!allowedTags.has(match[1].toLowerCase())) return '';
  }
  if (/\s(?:href|xlink:href|style)\s*=/i.test(svg) || /\son[a-z]+\s*=/i.test(svg) || /url\s*\(|javascript:|data:/i.test(svg)) return '';
  return svg;
}

function buildReceiptItems(
  items: CartItemResolved[],
  amountRub: number,
  configuredVat: string,
  paymentMethod: 'full_prepayment' | 'full_payment',
  markCodes?: Record<string, string[]>,
): Record<string, unknown>[] {
  const receiptItems: Record<string, unknown>[] = [];
  for (const item of items) {
    const tax = taxForItem(item.productId, configuredVat);
    const cleanName = item.title.replace(/\u00A0/g, ' ').slice(0, 128);
    const codes = paymentMethod === 'full_payment'
      ? (markCodes?.[item.uid] ?? []).map((code) => code.trim()).filter(Boolean)
      : [];
    if (codes.length > 0) {
      if (codes.length !== item.qty) {
        throw new Error(`Для маркированной позиции нужно ровно ${item.qty} код(а) DataMatrix.`);
      }
      for (const code of codes) {
        receiptItems.push({
          Name: cleanName,
          Price: item.price * 100,
          Quantity: 1,
          Amount: item.price * 100,
          Tax: tax,
          PaymentMethod: paymentMethod,
          PaymentObject: 'goods_with_marking_code',
          MeasurementUnit: 'шт',
          MarkProcessingMode: '0',
          MarkCode: { MarkCodeType: 'GS1M', Value: code },
        });
      }
    } else {
      receiptItems.push({
        Name: cleanName,
        Price: item.price * 100,
        Quantity: item.qty,
        Amount: item.price * item.qty * 100,
        Tax: tax,
        PaymentMethod: paymentMethod,
        PaymentObject: 'commodity',
        MeasurementUnit: 'шт',
      });
    }
  }
  const itemsSum = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  if (!Number.isSafeInteger(amountRub) || amountRub <= 0 || amountRub < itemsSum || !Number.isSafeInteger(amountRub * 100)) {
    throw new Error('Итог чека не совпадает с составом заказа.');
  }
  if (amountRub > itemsSum) {
    const deliveryKopeks = (amountRub - itemsSum) * 100;
    receiptItems.push({
      Name: 'Доставка',
      Price: deliveryKopeks,
      Quantity: 1,
      Amount: deliveryKopeks,
      Tax: configuredVat,
      PaymentMethod: paymentMethod,
      PaymentObject: 'service',
      MeasurementUnit: 'шт',
    });
  }
  return receiptItems;
}

export async function fetchTbankSbpQr(paymentId: string): Promise<{ ok: boolean; sbpPayloadUrl?: string; sbpQrSvg?: string; error?: string }> {
  if (isDemoMode()) {
    return {
      ok: true,
      sbpPayloadUrl: `#demo-sbp-${encodeURIComponent(paymentId)}`,
      sbpQrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,120,120"><rect width="120" height="120" fill="#FFFDF8"/><rect x="14" y="14" width="32" height="32" fill="#241B17"/><rect x="74" y="14" width="32" height="32" fill="#241B17"/><rect x="14" y="74" width="32" height="32" fill="#241B17"/><rect x="54" y="54" width="24" height="24" fill="#5B2824"/></svg>',
    };
  }
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  const password = process.env.TBANK_PASSWORD;
  if (!terminalKey || !password) return { ok: false, error: 'payment_not_configured' };
  const callQr = async (dataType: 'PAYLOAD' | 'IMAGE') => {
    const payload: Record<string, unknown> = { TerminalKey: terminalKey, PaymentId: paymentId, DataType: dataType };
    payload.Token = tbankToken(payload, password);
    const response = await fetch(`${TBANK_API_BASE}/GetQr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await response.json()) as { Success?: boolean; Data?: unknown };
    if (!response.ok || data.Success !== true || typeof data.Data !== 'string') return '';
    return data.Data;
  };
  try {
    const [rawPayloadUrl, rawQrSvg] = await Promise.all([callQr('PAYLOAD'), callQr('IMAGE')]);
    const sbpPayloadUrl = rawPayloadUrl ? safeSbpPayloadUrl(rawPayloadUrl) : '';
    const sbpQrSvg = rawQrSvg ? safeSbpSvg(rawQrSvg) : '';
    if (!sbpPayloadUrl && !sbpQrSvg) return { ok: false, error: 'sbp_qr_unavailable' };
    return { ok: true, ...(sbpPayloadUrl ? { sbpPayloadUrl } : {}), ...(sbpQrSvg ? { sbpQrSvg } : {}) };
  } catch (error) {
    logServerError('tbank-sbp-qr', error);
    return { ok: false, error: 'sbp_qr_unavailable' };
  }
}

export async function createTbankPayment(options: {
  orderId: string;
  accessToken: string;
  amountRub: number;
  items: CartItemResolved[];
  description: string;
  customerPhone: string;
  baseUrl: string;
  paymentMethod?: PaymentMethod;
}): Promise<PaymentResult> {
  if (!Number.isSafeInteger(options.amountRub) || options.amountRub <= 0 || !Number.isSafeInteger(options.amountRub * 100)) return { ok: false, error: 'invalid_amount' };
  const statusUrl = `${options.baseUrl.replace(/\/$/, '')}/order/${encodeURIComponent(options.orderId)}?token=${options.accessToken}`;
  if (isDemoMode()) {
    const demoId = 'DEMO-' + crypto.randomUUID();
    if (options.paymentMethod === 'sbp') {
      const qr = await fetchTbankSbpQr(demoId);
      return { ok: true, demo: true, paymentId: demoId, paymentUrl: statusUrl, sbpPayloadUrl: qr.sbpPayloadUrl, sbpQrSvg: qr.sbpQrSvg };
    }
    return { ok: true, demo: true, paymentId: demoId, paymentUrl: statusUrl };
  }
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  const password = process.env.TBANK_PASSWORD;
  const taxation = process.env.TBANK_TAXATION;
  const tax = process.env.TBANK_VAT;
  if (!terminalKey || !password || !taxation || !tax || !VALID_VAT_CODES.has(tax) || !process.env.SHOP_URL || !/^https:\/\//.test(process.env.SHOP_URL)) return { ok: false, error: 'payment_not_configured' };
  const phone = receiptPhoneOf(options.customerPhone);
  const payload: Record<string, unknown> = {
    TerminalKey: terminalKey,
    Amount: options.amountRub * 100,
    OrderId: options.orderId,
    Description: options.description,
    PayType: 'O',
    SuccessURL: statusUrl,
    FailURL: statusUrl,
    NotificationURL: `${options.baseUrl.replace(/\/$/, '')}/api/tbank/notify`,
    DATA: { Phone: phone },
    Receipt: {
      FfdVersion: '1.2',
      Phone: phone,
      Taxation: taxation,
      Items: buildReceiptItems(options.items, options.amountRub, tax, 'full_prepayment'),
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
    const paymentId = String(data.PaymentId);
    if (options.paymentMethod === 'sbp') {
      const qr = await fetchTbankSbpQr(paymentId);
      return { ok: true, paymentUrl: data.PaymentURL, paymentId, ...(qr.sbpPayloadUrl ? { sbpPayloadUrl: qr.sbpPayloadUrl } : {}), ...(qr.sbpQrSvg ? { sbpQrSvg: qr.sbpQrSvg } : {}) };
    }
    return { ok: true, paymentUrl: data.PaymentURL, paymentId };
  } catch (error) {
    logServerError('tbank-init', error);
    return { ok: false, error: 'payment_unavailable' };
  }
}

export async function cancelTbankPayment(options: { paymentId: string; amountRub?: number }): Promise<{ ok: boolean; status?: string; error?: string }> {
  if (isDemoMode()) return { ok: true, status: 'REFUNDED' };
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  const password = process.env.TBANK_PASSWORD;
  if (!terminalKey || !password) return { ok: false, error: 'payment_not_configured' };
  const payload: Record<string, unknown> = { TerminalKey: terminalKey, PaymentId: options.paymentId };
  if (options.amountRub !== undefined && Number.isSafeInteger(options.amountRub) && options.amountRub > 0) {
    payload.Amount = options.amountRub * 100;
  }
  payload.Token = tbankToken(payload, password);
  try {
    const response = await fetch(`${TBANK_API_BASE}/Cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await response.json()) as { Success?: boolean; Status?: unknown; Message?: unknown };
    if (!response.ok || data.Success !== true) {
      return { ok: false, error: typeof data.Message === 'string' && data.Message ? data.Message.slice(0, 200) : 'cancel_failed' };
    }
    return { ok: true, ...(typeof data.Status === 'string' && /^[A-Z_]{2,32}$/.test(data.Status) ? { status: data.Status } : {}) };
  } catch (error) {
    logServerError('tbank-cancel', error);
    return { ok: false, error: 'cancel_unavailable' };
  }
}

export async function fetchTbankPaymentState(paymentId: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  if (isDemoMode()) return { ok: true, status: 'REFUNDED' };
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  const password = process.env.TBANK_PASSWORD;
  if (!terminalKey || !password) return { ok: false, error: 'payment_not_configured' };
  const payload: Record<string, unknown> = { TerminalKey: terminalKey, PaymentId: paymentId };
  payload.Token = tbankToken(payload, password);
  try {
    const response = await fetch(`${TBANK_API_BASE}/GetState`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await response.json()) as { Success?: boolean; Status?: unknown; Message?: unknown };
    if (!response.ok || data.Success !== true || typeof data.Status !== 'string' || !/^[A-Z_]{2,32}$/.test(data.Status)) {
      return { ok: false, error: typeof data.Message === 'string' && data.Message ? data.Message.slice(0, 200) : 'state_unavailable' };
    }
    return { ok: true, status: data.Status };
  } catch (error) {
    logServerError('tbank-state', error);
    return { ok: false, error: 'state_unavailable' };
  }
}

export async function sendTbankClosingReceipt(options: {
  paymentId: string;
  customerPhone: string;
  items: CartItemResolved[];
  amountRub: number;
  markCodes?: Record<string, string[]>;
}): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) return { ok: true };
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  const password = process.env.TBANK_PASSWORD;
  const taxation = process.env.TBANK_TAXATION;
  const tax = process.env.TBANK_VAT;
  if (!terminalKey || !password || !taxation || !tax || !VALID_VAT_CODES.has(tax)) {
    return { ok: false, error: 'payment_not_configured' };
  }
  let receiptItems: Record<string, unknown>[];
  try {
    receiptItems = buildReceiptItems(options.items, options.amountRub, tax, 'full_payment', options.markCodes);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'invalid_mark_codes' };
  }
  const totalKopeks = options.amountRub * 100;
  const payload: Record<string, unknown> = {
    TerminalKey: terminalKey,
    PaymentId: options.paymentId,
    Receipt: {
      FfdVersion: '1.2',
      Phone: receiptPhoneOf(options.customerPhone),
      Taxation: taxation,
      Payments: { AdvancePayment: totalKopeks },
      Items: receiptItems,
    },
  };
  payload.Token = tbankToken(payload, password);
  try {
    const response = await fetch(TBANK_CLOSING_RECEIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await response.json()) as { Success?: boolean; Message?: unknown };
    if (!response.ok || data.Success !== true) {
      return { ok: false, error: typeof data.Message === 'string' && data.Message ? data.Message.slice(0, 200) : 'closing_receipt_failed' };
    }
    return { ok: true };
  } catch (error) {
    logServerError('tbank-closing-receipt', error);
    return { ok: false, error: 'closing_receipt_unavailable' };
  }
}

export function verifyTbankNotification(body: Record<string, unknown>): boolean {
  const password = process.env.TBANK_PASSWORD;
  if (isDemoMode() || !password || !process.env.TBANK_TERMINAL_KEY || body.TerminalKey !== process.env.TBANK_TERMINAL_KEY
    || typeof body.Token !== 'string' || !/^[a-fA-F0-9]{64}$/.test(body.Token)) return false;
  return equalSecrets(tbankToken(body, password), body.Token.toLowerCase());
}
