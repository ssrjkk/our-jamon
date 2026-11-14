// Скользящее окно в памяти процесса. Ключ — адрес клиента, который дописывает обратный
// прокси: всё, что стоит левее последней запятой в X-Forwarded-For, написал сам клиент,
// поэтому ротация заголовка не увеличивает квоту. Если прокси заголовка не добавил, адрес
// неизвестен, и публичные ручки лимит не применяют: одна общая корзина на весь магазин
// закрыла бы NAT или несколько вкладок одного покупателя. Вход администратора в этом
// случае остаётся под глобальной корзиной — её ротацией заголовка не обойти.

import { NextResponse } from 'next/server';

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

// Ключом может быть произвольная строка из заголовка: без потолка карта съела бы память.
const MAX_BUCKETS = 10000;

export function clientAddress(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((hop) => hop.trim()).filter(Boolean);
    return hops.length ? hops[hops.length - 1] : null;
  }
  const real = headers.get('x-real-ip')?.trim();
  return real || null;
}

/** Отмечает обращение и забирает квоту. Логин зовёт hit() только при неверном пароле. */
export function throttle(name: string, key: string, limit: number, windowMs: number, now = Date.now()): { allowed: boolean; retryAfterSeconds: number; hit: () => void } {
  const id = `${name}:${key}`;
  const bucket = buckets.get(id) ?? createBucket(id, now, windowMs);
  bucket.hits = bucket.hits.filter((at) => now - at < windowMs);
  if (bucket.hits.length >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.hits[0] + windowMs - now) / 1000)), hit: () => {} };
  }
  const hits = bucket.hits;
  return { allowed: true, retryAfterSeconds: 0, hit: () => { hits.push(now); } };
}

function createBucket(id: string, now: number, windowMs: number): Bucket {
  if (buckets.size >= MAX_BUCKETS) evict(now, windowMs);
  const created: Bucket = { hits: [] };
  buckets.set(id, created);
  return created;
}

/** null — обращение проходит и засчитано; иначе готовый ответ 429 с Retry-After. */
export function guardAttempts(name: string, headers: Headers, limit: number, windowMs: number): NextResponse | null {
  const address = clientAddress(headers);
  if (!address) return null;
  const verdict = throttle(name, address, limit, windowMs);
  if (verdict.allowed) {
    verdict.hit();
    return null;
  }
  return NextResponse.json(
    { error: `Слишком много обращений. Повторите через ${verdict.retryAfterSeconds} с.` },
    { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } },
  );
}

function evict(now: number, windowMs: number): void {
  for (const [id, bucket] of buckets) {
    if (!bucket.hits.some((at) => now - at < windowMs)) buckets.delete(id);
  }
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}
