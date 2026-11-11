export function isDemoMode(): boolean {
  const mode = process.env.SHOP_MODE || 'demo';
  if (mode !== 'demo' && mode !== 'live') throw new Error('SHOP_MODE must be demo or live');
  return mode === 'demo';
}

// SHOP_URL задаёт единственный разрешённый адрес витрины. Если он не выставлен, сравниваем
// источник с Host самого запроса: req.nextUrl.origin в standalone-сервере всегда рисует localhost,
// и витрина по IP или домену без SHOP_URL отбивала бы кнопку оплаты у реального покупателя.
export function requestOriginAllowed(origin: string | null, host: string | null, fallbackOrigin: string): boolean {
  if (!origin) return true;
  try {
    if (process.env.SHOP_URL?.trim()) return origin === new URL(process.env.SHOP_URL).origin;
    return new URL(origin).host === (host || new URL(fallbackOrigin).host);
  } catch {
    return false;
  }
}

export function configuredAmount(name: string): number | null {
  const raw = process.env[name];
  if (!raw?.trim()) return null;
  const amount = Number(raw);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`Invalid amount configuration: ${name}`);
  return amount;
}
