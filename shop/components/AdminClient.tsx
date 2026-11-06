'use client';

import { useCallback, useEffect, useState } from 'react';
import { Order } from '@/lib/types';
import { formatRub } from './CartContext';

// Админка лавки: вход по паролю (env ADMIN_PASSWORD), список заказов,
// подтверждение веса (взвесил кусок -> ввёл фактический вес -> ссылка Т-Банка
// ушла клиенту), повторная отправка ссылки, отмена.
// Полную админку заменяет 1С:УНФ - здесь только операционные действия.
export default function AdminClient() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/orders');
    if (res.status === 401) { setAuthed(false); return; }
    const data = await res.json();
    setOrders(data.orders || []);
    setAuthed(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setError('Неверный пароль');
      return;
    }
    await load();
  }

  async function act(orderId: string, body: Record<string, unknown>) {
    setBusyId(orderId);
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || 'Ошибка действия');
      return;
    }
    setError('');
    await load();
  }

  if (!authed) {
    return (
      <main className="container" style={{ maxWidth: 420, paddingTop: 48, paddingBottom: 64 }}>
        <h1 className="section-title" style={{ marginBottom: 16 }}>Админка лавки</h1>
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-field">
            <label htmlFor="admin-pass">Пароль администратора</label>
            <input id="admin-pass" type="password" className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <div className="form-status-box error">{error}</div>}
          <button type="submit" className="btn-primary">Войти</button>
        </form>
        <p className="footer-caption" style={{ marginTop: 16 }}>
          Пароль задаётся в переменной окружения ADMIN_PASSWORD. Операционный учёт ведётся в 1С:УНФ - здесь только подтверждение веса и оплаты.
        </p>
      </main>
    );
  }

  const statusChip = (s: Order['status']) => {
    const map: Record<string, [string, string]> = {
      awaiting_weight: ['aw', 'На проверке веса'],
      awaiting_payment: ['ap', 'Ждёт оплаты'],
      paid: ['paid', 'Оплачен'],
      cancelled: ['cancelled', 'Отменён'],
    };
    const [cls, label] = map[s];
    return <span className={'status-chip ' + cls}>{label}</span>;
  };

  return (
    <main className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <h1 className="section-title">Заказы</h1>
        <button type="button" className="btn-secondary" onClick={load}>Обновить</button>
      </div>
      {error && <div className="form-status-box error" style={{ marginBottom: 12 }}>{error}</div>}
      {orders.length === 0 && <p className="section-subtitle">Заказов пока нет. Оформите тестовый заказ с витрины - он появится здесь.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {orders.map((o) => (
          <div key={o.id} className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <strong style={{ fontSize: '1.1rem' }}>№ {o.id}</strong>
              {statusChip(o.status)}
              <span className="tabular" style={{ color: 'var(--graphite-muted)', fontSize: '0.8125rem' }}>
                {new Date(o.createdAt).toLocaleString('ru-RU')}
              </span>
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--graphite-muted)' }}>
              {o.customer.name} · <span className="tabular">{o.customer.phone}</span> · {o.delivery.name}{o.delivery.address ? ` · ${o.delivery.address}` : ''} · ссылка в {o.messenger}
            </div>
            <table className="admin-table">
              <thead>
                <tr><th>Позиция</th><th>Вес, г</th><th>Цена</th><th>Подтверждение веса</th></tr>
              </thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.uid}>
                    <td><strong>{i.title}</strong><br /><span style={{ color: 'var(--graphite-muted)', fontSize: '0.8125rem' }}>{i.label}{i.qty > 1 ? ` × ${i.qty}` : ''}</span></td>
                    <td className="tabular">{i.weightG}</td>
                    <td className="tabular">{formatRub(i.price * (i.qty || 1))}</td>
                    <td>
                      {i.requiresWeightCheck && o.status === 'awaiting_weight' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            className="form-input tabular"
                            style={{ width: 110, minHeight: 40 }}
                            inputMode="numeric"
                            placeholder={String(i.weightG)}
                            value={weights[i.uid] || ''}
                            onChange={(e) => setWeights((prev) => ({ ...prev, [i.uid]: e.target.value }))}
                            aria-label={`Фактический вес: ${i.label}`}
                          />
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busyId === o.id}
                            onClick={() => act(o.id, { action: 'confirm-weight', itemId: i.uid, actualWeightG: Number(weights[i.uid]) || i.weightG })}
                          >
                            Подтвердить
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--graphite-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span>Итого: <strong className="tabular" style={{ fontSize: '1.1rem' }}>{formatRub(o.total)}</strong></span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {o.paymentUrl && o.status === 'awaiting_payment' && (
                  <>
                    <a className="btn-secondary" href={`/order/${o.id}`} target="_blank" rel="noopener">Страница заказа</a>
                    <button type="button" className="btn-secondary" disabled={busyId === o.id} onClick={() => act(o.id, { action: 'resend-link' })}>
                      Повторно отправить ссылку
                    </button>
                  </>
                )}
                {o.status !== 'paid' && o.status !== 'cancelled' && (
                  <button type="button" className="btn-secondary" disabled={busyId === o.id} onClick={() => act(o.id, { action: 'cancel' })}>
                    Отменить
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
