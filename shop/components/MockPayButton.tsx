'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = { orderId: string; token: string; action: 'demo-pay' | 'retry-payment' };

export default function MockPayButton({ orderId, token, action }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const isDemoPay = action === 'demo-pay';

  async function perform() {
    if (pending.current || completed) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, token }),
      });
      const data: { ok?: boolean; error?: string } = await response.json();
      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || (isDemoPay ? 'Демо-оплата не подтверждена. Повторите попытку.' : 'Ссылку на оплату пока не удалось создать. Повторите попытку или свяжитесь с лавкой.'));
      }
      setCompleted(true);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Нет ответа от сервера. Обновите страницу и проверьте статус заказа.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="order-payment-action" aria-busy={busy}>
      <button type="button" className="btn-primary" onClick={perform} disabled={busy || completed}>
        {completed ? 'Обновляем статус…' : busy ? isDemoPay ? 'Проверяем демо-оплату…' : 'Создаём ссылку…' : isDemoPay ? 'Подтвердить демо-оплату' : 'Повторить создание ссылки на оплату'}
      </button>
      {isDemoPay && <p className="checkout-hint">Тестовое действие: деньги не списываются, обращения в реальный банк нет.</p>}
      {error && <p className="form-status-box error" role="alert">{error}</p>}
      {completed && <p className="form-status-box success" role="status">{isDemoPay ? 'Сервер подтвердил демо-оплату. Обновляем заказ.' : 'Ссылка создана. Обновляем заказ.'}</p>}
    </div>
  );
}
