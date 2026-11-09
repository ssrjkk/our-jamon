import crypto from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'nh_admin';
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

export function adminPassword(): string | undefined {
  const password = process.env.ADMIN_PASSWORD;
  return password && password.length >= 16 ? password : undefined;
}

export function equalSecrets(left: string, right: string): boolean {
  const a = crypto.createHash('sha256').update(left).digest();
  const b = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(a, b);
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
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return Boolean(token && verifyAdminToken(token));
}
