'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Кнопка демо-оплаты: дёргает webhook Т-Банка в мок-режиме (без боевых ключей
// подпись не проверяется). В боевом режиме не показывается - клиент уходит
// на реальную платёжную страницу Т-Банка.
export default function MockPayButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    await fetch('/api/tbank/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ OrderId: orderId, Success: 'true', Status: 'CONFIRMED', PaymentId: 'MOCK-' + Date.now() }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button type="button" className="btn-primary" onClick={pay} disabled={busy} style={{ alignSelf: 'flex-start' }}>
      {busy ? 'Проводим оплату…' : 'Оплатить (демо-режим Т-Банка)'}
    </button>
  );
}
