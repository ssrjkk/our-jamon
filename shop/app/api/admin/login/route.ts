import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, adminPassword, adminToken } from '@/lib/admin';

// POST /api/admin/login — вход администратора { password }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.password !== adminPassword()) {
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 12,
    path: '/',
  });
  return res;
}
