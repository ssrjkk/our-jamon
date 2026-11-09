export function isDemoMode(): boolean {
  const mode = process.env.SHOP_MODE || 'demo';
  if (mode !== 'demo' && mode !== 'live') throw new Error('SHOP_MODE must be demo or live');
  return mode === 'demo';
}

export function requestOriginAllowed(origin: string | null, fallbackOrigin: string): boolean {
  if (!origin) return true;
  try {
    const expected = new URL(process.env.SHOP_URL || fallbackOrigin);
    return (expected.protocol === 'https:' || expected.protocol === 'http:') && origin === expected.origin;
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
