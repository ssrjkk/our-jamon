import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, adminPassword, adminToken, equalSecrets } from '@/lib/admin';
import { requestOriginAllowed } from '@/lib/config';

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!requestOriginAllowed(origin, req.nextUrl.origin)) {
    return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 });
  }
  const secret = adminPassword();
  if (!secret) return NextResponse.json({ error: 'Доступ администратора ещё не настроен' }, { status: 503 });
  const body: unknown = await req.json().catch(() => null);
  const password = body && typeof body === 'object' && 'password' in body ? body.password : undefined;
  if (typeof password !== 'string' || password.length > 512 || !equalSecrets(password, secret)) {
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
  if (!requestOriginAllowed(origin, req.nextUrl.origin)) return NextResponse.json({ error: 'Недопустимый источник запроса' }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 0, path: '/' });
  return response;
}
