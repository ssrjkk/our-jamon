import crypto from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'nh_admin';
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function adminPassword(): string | undefined {
  const password = process.env.ADMIN_PASSWORD;
  return password && password.length >= 16 ? password : undefined;
}

export function equalSecrets(left: string, right: string): boolean {
  // Хеш от секрета здесь ни при чём: сравниваем уже готовые секреты (пароль админки, токен
  // доступа к заказу, подпись Т-Банка), а не проверяем пароль из базы. sha256 перед сравнением
  // только выравнивал длину и поднимал CodeQL «недостаточное хеширование пароля».
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  // Разная длина — разные значения: выход по длине не скрывает секрет, его формат известен.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeIp(value: string): string {
  return value.trim().replace(/^::ffff:/i, '');
}

export function adminIpAllowed(address: string | null | undefined): boolean {
  const raw = process.env.ADMIN_ALLOW_IPS?.trim();
  if (!raw) return true;
  if (!address) return false;
  const current = normalizeIp(address);
  return raw.split(',').map(normalizeIp).filter(Boolean).includes(current);
}

function decodeBase32(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z2-7]+={0,6}$/.test(clean)) throw new Error('ADMIN_TOTP_SECRET must be valid Base32');
  const unpadded = clean.replace(/=+$/, '');
  const padding = clean.length - unpadded.length;
  const remainder = unpadded.length % 8;
  const expectedPadding: Record<number, number> = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 };
  if (expectedPadding[remainder] === undefined || (padding > 0 && (clean.length % 8 !== 0 || padding !== expectedPadding[remainder]))) {
    throw new Error('ADMIN_TOTP_SECRET has an invalid Base32 length');
  }
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of unpadded) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function adminTotpKey(): Buffer | undefined {
  const secret = process.env.ADMIN_TOTP_SECRET?.trim();
  if (!secret) return undefined;
  const key = decodeBase32(secret);
  if (key.length < 10) throw new Error('ADMIN_TOTP_SECRET must contain at least 80 bits');
  return key;
}

function totpCodeAt(key: Buffer, step: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(step), 0);
  const digest = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const num =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(num % 1_000_000).padStart(6, '0');
}

export function adminTotpRequired(): boolean {
  return Boolean(adminTotpKey());
}

export function verifyAdminTotp(
  code: string,
  claimStep: (step: number) => boolean,
  nowMs = Date.now(),
): boolean {
  const key = adminTotpKey();
  if (!key) return true;
  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  const currentStep = Math.floor(nowMs / 1000 / 30);
  for (const delta of [-1, 0, 1]) {
    const step = currentStep + delta;
    if (equalSecrets(clean, totpCodeAt(key, step))) {
      return claimStep(step);
    }
  }
  return false;
}

export function adminToken(): string {
  const secret = adminPassword();
  if (!secret) throw new Error('Administrator access is not configured');
  const payload = `${Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS}.${crypto.randomBytes(16).toString('hex')}`;
  return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
}

export function verifyAdminToken(token: string): boolean {
  const secret = adminPassword();
  if (!secret || !/^\d{10,13}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, nonce, signature] = token.split('.');
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${expires}.${nonce}`).digest('hex');
  return equalSecrets(signature, expected);
}

export async function isAdmin(): Promise<boolean> {
  try {
    adminTotpRequired();
  } catch {
    return false;
  }
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return Boolean(token && verifyAdminToken(token));
}
