import { connection, NextResponse } from 'next/server';
import { databaseHealth } from '@/lib/orders';
import { catalogHealth } from '@/lib/products';
import { isDemoMode } from '@/lib/config';
import { logServerError } from '@/lib/server-log';

// Единственная ручка, которую читает контейнер и внешний мониторинг. Отвечает тем, что
// можно показать без авторизации: читается ли база и каким источником наполнен каталог.
// Заказов, телефонов и значений переменных здесь нет, поэтому лог открытия базы
// пишется отдельно — в ответе остаётся только «ok» или «unavailable».
export async function GET() {
  await connection();
  let database: 'ok' | 'unavailable' = 'ok';
  try {
    if (!databaseHealth()) database = 'unavailable';
  } catch (error) {
    logServerError('health', error);
    database = 'unavailable';
  }
  const catalog = catalogHealth();
  return NextResponse.json(
    {
      status: database === 'ok' ? 'ok' : 'error',
      mode: isDemoMode() ? 'demo' : 'live',
      database,
      catalog: { origin: catalog ? catalog.origin : 'unknown', notice: catalog ? catalog.notice : null, checkedAt: catalog ? catalog.checkedAt : null },
    },
    { status: database === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
