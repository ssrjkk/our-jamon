import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, adminPassword, adminToken, equalSecrets } from '@/lib/admin';
import { requestOriginAllowed } from '@/lib/config';
import { clientAddress, throttle } from '@/lib/rate-limit';

// Пароль администратора длиннее шестнадцати знаков, но перебор всё равно обязан иметь
// потолок: окно считается по неудачным попыткам, поэтому владелец, который вводит
// пароль десять раз в день, его не выбирает. Глобальная корзина не даёт обойти
// адресную перестановкой X-Forwarded-For.
const PER_ADDRESS = { limit: 10, windowMs: 15 * 60 * 1000 };
const GLOBAL = { limit: 30, windowMs: 60 * 60 * 1000 };

function wait(seconds: number): string {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} мин` : `${seconds} с`;
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!requestOriginAllowed(origin, req.headers.get('host'), req.nextUrl.origin)) {
    return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 });
  }
  const now = Date.now();
  const address = clientAddress(req.headers);
  const windows: [string, number, number][] = [['global', GLOBAL.limit, GLOBAL.windowMs]];
  if (address) windows.push([address, PER_ADDRESS.limit, PER_ADDRESS.windowMs]);
  const verdicts = windows.map(([key, limit, windowMs]) => throttle('admin-login', key, limit, windowMs, now));
  const blocked = verdicts.filter((verdict) => !verdict.allowed);
  if (blocked.length) {
    const seconds = Math.max(...blocked.map((verdict) => verdict.retryAfterSeconds));
    return NextResponse.json({ error: `Слишком много неудачных попыток входа. Повторите через ${wait(seconds)}.` }, { status: 429, headers: { 'Retry-After': String(seconds) } });
  }
  const secret = adminPassword();
  if (!secret) return NextResponse.json({ error: 'Доступ администратора ещё не настроен' }, { status: 503 });
  const body: unknown = await req.json().catch(() => null);
  const password = body && typeof body === 'object' && 'password' in body ? body.password : undefined;
  if (typeof password !== 'string' || password.length > 512 || !equalSecrets(password, secret)) {
    verdicts.forEach((verdict) => verdict.hit());
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ADMIN_SESSION_SECONDS,
    path: '/',
  });
  return response;
}

export async function DELETE(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!requestOriginAllowed(origin, req.headers.get('host'), req.nextUrl.origin)) return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 0, path: '/' });
  return response;
}
