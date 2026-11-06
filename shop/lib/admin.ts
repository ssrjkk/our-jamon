import crypto from 'crypto';
import { cookies } from 'next/headers';

// Простая защита админки: пароль из env (по умолчанию dev-пароль),
// в cookie кладём sha256(пароль) - проверяем на каждом admin-запросе.
const ADMIN_COOKIE = 'nh_admin';

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'nashhamon-dev'; // ЗАМЕНИТЬ в .env
}

export function adminToken(): string {
  return crypto.createHash('sha256').update(adminPassword()).digest('hex').slice(0, 32);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value === adminToken();
}

export { ADMIN_COOKIE };
