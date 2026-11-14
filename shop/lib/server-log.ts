// Причина отказа покупатель не видит: витрина обязана отвечать общим текстом, а не стеком.
// Значит единственный способ для лавки узнать, что именно сломалось, — запись в журнал
// сервера. Без неё ветка «503» неотличима от «так задумано», а таймаут 1С — от TypeError.
// В журнале только имя и сообщение: телефоны, адреса и токены в сообщение не попадают.
export function logServerError(scope: string, error: unknown): void {
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[${scope}] ${reason}`);
}

// Событие без исключения: подпись сошлась, а пары деньги не нашли. Молчание здесь —
// потерянная оплата, поэтому запись ставится даже когда ответ остаётся прежним.
export function logServerNotice(scope: string, message: string): void {
  console.error(`[${scope}] ${message}`);
}
