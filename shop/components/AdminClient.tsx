'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Order } from '@/lib/types';
import { formatRub, formatWeightLabel } from './CartContext';

type Feedback = { kind: 'error' | 'success'; text: string };
type OrderFields = Record<string, Record<string, string>>;
type ActionResponse = { order?: Order; ok?: boolean; error?: string };
const statuses: Record<Order['status'], { className: string; label: string }> = {
  awaiting_confirmation: { className: 'aw', label: 'На согласовании' },
  awaiting_payment: { className: 'ap', label: 'Ожидает оплаты' },
  paid: { className: 'paid', label: 'Оплачен' },
  cancelled: { className: 'cancelled', label: 'Отменён' },
};
const dateTime = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(value));
const weightId = (orderId: string, uid: string) => `admin-weight-${orderId}-${uid}`;

export default function AdminClient() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [weights, setWeights] = useState<OrderFields>({});
  const [deliveryCosts, setDeliveryCosts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<OrderFields>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [loading, setLoading] = useState(true);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const actionPending = useRef(false);
  const sessionPending = useRef(false);
  const requestId = useRef(0);

  const forgetSession = useCallback(() => {
    setAuthed(false);
    setOrders([]);
    setWeights({});
    setDeliveryCosts({});
    setFieldErrors({});
    setFeedback({});
    setPassword('');
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    const request = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/orders', { cache: 'no-store', signal });
      if (signal?.aborted || request !== requestId.current) return;
      if (response.status === 401) { forgetSession(); return; }
      const data: { orders?: Order[]; error?: string } = await response.json();
      if (signal?.aborted || request !== requestId.current) return;
      if (!response.ok || !Array.isArray(data.orders)) throw new Error(data.error || 'Не удалось загрузить заказы. Повторите попытку.');
      setOrders(data.orders);
      setAuthed(true);
    } catch {
      if (signal?.aborted || request !== requestId.current) return;
      setError('Заказы недоступны. Проверьте соединение и обновите список.');
    } finally {
      if (!signal?.aborted && request === requestId.current) setLoading(false);
    }
  }, [forgetSession]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sessionPending.current || loading) return;
    setError('');
    setPasswordError('');
    if (!password) {
      setPasswordError('Введите пароль администратора.');
      document.getElementById('admin-pass')?.focus();
      return;
    }
    sessionPending.current = true;
    setSessionBusy(true);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setPasswordError(data.error || 'Неверный пароль.');
          document.getElementById('admin-pass')?.focus();
        } else {
          setError(response.status === 503 ? 'Доступ ещё не настроен. Владелец магазина должен настроить надёжный секрет администратора.' : data.error || 'Не удалось войти. Повторите попытку.');
        }
        return;
      }
      setPassword('');
      setAuthed(true);
      await load();
    } catch {
      setError('Нет ответа от сервера. Проверьте соединение и повторите вход.');
    } finally {
      sessionPending.current = false;
      setSessionBusy(false);
    }
  }

  async function logout() {
    if (sessionPending.current || actionPending.current || loading) return;
    sessionPending.current = true;
    setSessionBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/login', { method: 'DELETE' });
      if (!response.ok) throw new Error();
      ++requestId.current;
      forgetSession();
    } catch {
      setError('Не удалось выйти. Повторите попытку; сессия может оставаться активной.');
    } finally {
      sessionPending.current = false;
      setSessionBusy(false);
    }
  }

  function updateField(orderId: string, field: string, value: string) {
    if (field === 'deliveryCost') setDeliveryCosts((previous) => ({ ...previous, [orderId]: value }));
    else setWeights((previous) => ({ ...previous, [orderId]: { ...previous[orderId], [field]: value } }));
    setFieldErrors((previous) => ({ ...previous, [orderId]: { ...previous[orderId], [field]: '' } }));
    setFeedback((previous) => ({ ...previous, [orderId]: { kind: 'success', text: '' } }));
  }

  async function act(orderId: string, body: Record<string, unknown>) {
    if (actionPending.current || sessionPending.current || loading) return;
    actionPending.current = true;
    setBusyId(orderId);
    setFeedback((previous) => ({ ...previous, [orderId]: { kind: 'success', text: '' } }));
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data: ActionResponse = await response.json();
      if (response.status === 401) {
        forgetSession();
        setError('Сессия завершилась. Войдите снова.');
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Действие не выполнено. Обновите заказ и повторите попытку.');
      let message: Feedback;
      if (body.action === 'sync-onec') {
        message = data.ok === true ? { kind: 'success', text: 'Заказ синхронизирован с 1С.' } : { kind: 'error', text: 'Синхронизация с 1С не выполнена. Проверьте подключение и повторите попытку.' };
      } else if (!data.order) {
        throw new Error('Ответ о результате не получен. Обновите список перед повторным действием.');
      } else if (body.action === 'cancel') {
        message = { kind: 'success', text: 'Заказ отменён.' };
      } else if (data.order.paymentError || !data.order.paymentUrl) {
        message = { kind: 'error', text: body.action === 'confirm-order' ? 'Вес и доставка подтверждены, но ссылка на оплату не создана. Повторите создание ссылки.' : 'Ссылка на оплату не создана. Повторите попытку или проверьте настройку платежей.' };
      } else {
        message = { kind: 'success', text: body.action === 'confirm-order' ? 'Все веса и доставка подтверждены. Ссылка на оплату готова; передайте покупателю страницу заказа вручную.' : 'Ссылка на оплату готова.' };
      }
      if (data.order) {
        const updated = data.order;
        setOrders((previous) => previous.map((order) => order.id === orderId ? updated : order));
      }
      setFeedback((previous) => ({ ...previous, [orderId]: message }));
      await load();
    } catch (failure) {
      setFeedback((previous) => ({ ...previous, [orderId]: { kind: 'error', text: failure instanceof Error ? failure.message : 'Нет ответа от сервера. Обновите заказ перед повторным действием.' } }));
    } finally {
      actionPending.current = false;
      setBusyId(null);
    }
  }

  function confirm(event: FormEvent<HTMLFormElement>, order: Order) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const actualWeights: Record<string, number> = {};
    for (const item of order.items.filter((item) => item.requiresWeightCheck)) {
      const raw = (weights[order.id]?.[item.uid] ?? '').trim();
      const value = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 30000) nextErrors[item.uid] = 'Введите фактический целый вес от 1 до 30 000 г.';
      else actualWeights[item.uid] = value;
    }
    const rawCost = (deliveryCosts[order.id] ?? '').trim();
    const deliveryCost = rawCost === '' ? undefined : Number(rawCost);
    if (rawCost === '' && order.delivery.cost === null) nextErrors.deliveryCost = 'Согласуйте и укажите стоимость доставки.';
    else if (deliveryCost !== undefined && (!/^\d+$/.test(rawCost) || !Number.isSafeInteger(deliveryCost) || deliveryCost < 0 || deliveryCost > 100000)) nextErrors.deliveryCost = 'Введите целую стоимость от 0 до 100 000 ₽.';
    setFieldErrors((previous) => ({ ...previous, [order.id]: nextErrors }));
    const firstField = Object.keys(nextErrors)[0];
    if (firstField) {
      document.getElementById(firstField === 'deliveryCost' ? `admin-delivery-${order.id}` : weightId(order.id, firstField))?.focus();
      setFeedback((previous) => ({ ...previous, [order.id]: { kind: 'error', text: 'Проверьте все веса и стоимость доставки. Ничего не отправлено.' } }));
      return;
    }
    void act(order.id, { action: 'confirm-order', weights: actualWeights, ...(deliveryCost !== undefined ? { deliveryCost } : {}) });
  }

  async function copyOrder(order: Order) {
    if (actionPending.current || sessionPending.current || loading) return;
    actionPending.current = true;
    setBusyId(order.id);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/order/${encodeURIComponent(order.id)}?token=${encodeURIComponent(order.accessToken)}`);
      setFeedback((previous) => ({ ...previous, [order.id]: { kind: 'success', text: 'Ссылка на заказ скопирована. Передайте её покупателю вручную; она открывает персональные сведения заказа.' } }));
    } catch {
      setFeedback((previous) => ({ ...previous, [order.id]: { kind: 'error', text: 'Браузер не разрешил копирование. Откройте страницу заказа и скопируйте адрес вручную.' } }));
    } finally {
      actionPending.current = false;
      setBusyId(null);
    }
  }

  const disabled = loading || sessionBusy || busyId !== null;
  if (!authed) {
    return (
      <main id="main-content" className="container admin-page">
        <section className="bento-card admin-login" aria-labelledby="admin-title">
          <p className="section-eyebrow">Для команды лавки</p>
          <h1 id="admin-title" className="section-title">Управление заказами</h1>
          <p className="checkout-hint">Проверка веса, согласование доставки и контроль оплаты.</p>
          {loading ? <p className="form-status-box" role="status">Проверяем сессию…</p> : (
            <form className="checkout-form" onSubmit={login} noValidate aria-busy={sessionBusy}>
              <div className="form-field">
                <label htmlFor="admin-pass">Пароль администратора</label>
                <input id="admin-pass" type="password" className="form-input" value={password} disabled={sessionBusy} onChange={(event) => { setPassword(event.target.value); setPasswordError(''); setError(''); }} autoComplete="current-password" maxLength={512} required aria-invalid={Boolean(passwordError)} aria-describedby={passwordError ? 'admin-password-error' : undefined} />
                {passwordError && <p id="admin-password-error" className="field-error" role="alert">{passwordError}</p>}
              </div>
              <button type="submit" className="btn-primary" disabled={sessionBusy}>{sessionBusy ? 'Входим…' : 'Войти'}</button>
            </form>
          )}
          {error && <div className="form-status-box error" role="alert"><p>{error}</p><button type="button" className="btn-secondary" disabled={disabled} onClick={() => { void load(); }}>Проверить доступ ещё раз</button></div>}
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="container admin-page">
      <header className="admin-header">
        <div><p className="section-eyebrow">Операционная панель</p><h1 className="section-title">Заказы</h1><p className="checkout-hint">Время указано по Москве. Оплата не подтверждает отправку.</p></div>
        <div className="checkout-actions">
          <button type="button" className="btn-secondary" disabled={disabled} onClick={() => { void load(); }}>{loading ? 'Обновляем…' : 'Обновить заказы'}</button>
          <button type="button" className="btn-secondary" disabled={disabled} onClick={logout}>{sessionBusy ? 'Выходим…' : 'Выйти'}</button>
        </div>
      </header>
      {error && <p className="form-status-box error" role="alert">{error}</p>}
      {loading && <p className="checkout-hint" role="status">Загружаем актуальные заказы…</p>}
      {!loading && !error && orders.length === 0 && <div className="cart-empty-state"><h2 className="checkout-title">Заказов пока нет</h2><p>Новые заказы появятся здесь после оформления. Обновите список, чтобы проверить поступления.</p></div>}
      <div className="admin-orders">
        {orders.map((order) => {
          const status = statuses[order.status];
          const confirming = order.status === 'awaiting_confirmation';
          const closed = order.status === 'paid' || order.status === 'cancelled';
          const canCancel = !closed && (order.demo || !order.paymentId);
          const pendingWeights = order.items.some((item) => item.requiresWeightCheck && !item.weightConfirmed);
          const message = feedback[order.id];
          const errors = fieldErrors[order.id] ?? {};
          const pageUrl = `/order/${encodeURIComponent(order.id)}?token=${encodeURIComponent(order.accessToken)}`;
          return (
            <article key={order.id} className="bento-card admin-order-card" aria-labelledby={`admin-order-${order.id}`} aria-busy={busyId === order.id}>
              <header className="admin-order-header">
                <h2 id={`admin-order-${order.id}`} className="checkout-title">№ {order.id}</h2>
                <span className={'status-chip ' + status.className}>{status.label}</span>
                <time className="checkout-hint tabular" dateTime={order.createdAt}>{dateTime(order.createdAt)}</time>
              </header>
              {order.demo && <p className="demo-note"><strong>Демо-заказ.</strong> Реальной оплаты и передачи в банк или 1С нет. Не используйте реальные персональные данные.</p>}
              <div className="admin-customer">
                <p><strong>{order.customer.name}</strong> · <a className="tabular" href={`tel:${order.customer.phone}`}>{order.customer.phone}</a></p>
                <p>{order.delivery.name}{order.delivery.address ? ` · ${order.delivery.address}` : ''}</p>
                <p className="checkout-hint">Связь: {order.messenger}. Отправка ссылки вручную, без автоматической рассылки.</p>
                <p className="checkout-hint">{order.consentedAt ? `Согласие на обработку данных: ${dateTime(order.consentedAt)}.` : 'Отметка о согласии отсутствует.'}</p>
              </div>
              <form className="checkout-form" onSubmit={(event) => confirm(event, order)} noValidate>
                <fieldset className="checkout-fieldset" disabled={disabled || !confirming}>
                  <legend>{confirming ? 'Проверить все позиции' : 'Состав заказа'}</legend>
                  <div className="cart-items admin-items">
                    {order.items.map((item) => {
                      const inputId = weightId(order.id, item.uid);
                      return (
                        <div key={item.uid} className="cart-item-row">
                          <div className="cart-item-details">
                            <strong className="cart-item-title">{item.title}</strong>
                            <span className="cart-item-sub">{item.label} · {item.qty} шт.</span>
                            <p className="cart-item-note tabular">{formatWeightLabel(item.weightG)} за шт.{item.qty > 1 ? ` · всего ${formatWeightLabel(item.weightG * item.qty)}` : ''}</p>
                            <p className="cart-item-note">{item.requiresWeightCheck ? item.weightConfirmed ? 'Вес подтверждён.' : 'Нужен фактический вес.' : 'Фиксированная фасовка.'} {item.pricePerKg === null ? 'Цена за штуку фиксирована; изменение веса её не меняет.' : `${formatRub(item.pricePerKg)} / кг.`}</p>
                            {confirming && item.requiresWeightCheck && <div className="form-field">
                              <label htmlFor={inputId}>Фактический вес: {item.title}, г</label>
                              <input id={inputId} type="number" className="form-input tabular" inputMode="numeric" min={1} max={30000} step={1} value={weights[order.id]?.[item.uid] ?? ''} placeholder="Взвесьте и введите вес" onChange={(event) => updateField(order.id, item.uid, event.target.value)} required aria-invalid={Boolean(errors[item.uid])} aria-describedby={errors[item.uid] ? `${inputId}-error` : undefined} />
                              {errors[item.uid] && <p id={`${inputId}-error`} className="field-error" role="alert">{errors[item.uid]}</p>}
                            </div>}
                          </div>
                          <div className="cart-item-price"><strong className="tabular">{formatRub(item.price * item.qty)}</strong><p className="cart-item-note">{item.requiresWeightCheck && !item.weightConfirmed && item.pricePerKg !== null ? 'Предварительно' : 'За позицию'}</p></div>
                        </div>
                      );
                    })}
                  </div>
                  {confirming && <div className="form-field">
                    <label htmlFor={`admin-delivery-${order.id}`}>Согласованная стоимость доставки до скидки, ₽{order.delivery.cost !== null ? ' (необязательно)' : ''}</label>
                    <input id={`admin-delivery-${order.id}`} type="number" className="form-input tabular" inputMode="numeric" min={0} max={100000} step={1} value={deliveryCosts[order.id] ?? ''} onChange={(event) => updateField(order.id, 'deliveryCost', event.target.value)} placeholder={order.delivery.baseCost === null ? 'Введите согласованную стоимость' : String(order.delivery.baseCost)} required={order.delivery.cost === null} aria-invalid={Boolean(errors.deliveryCost)} aria-describedby={`admin-delivery-hint-${order.id}${errors.deliveryCost ? ` admin-delivery-error-${order.id}` : ''}`} />
                    <p id={`admin-delivery-hint-${order.id}`} className="checkout-hint">{order.delivery.cost === null ? 'Без стоимости доставки заказ нельзя подтвердить. Ноль допустим только для согласованной бесплатной доставки.' : 'Если поле пустое, сохраним исходную стоимость.'}{order.delivery.freeFrom !== null ? ` Порог бесплатной доставки: ${formatRub(order.delivery.freeFrom)}; сервер применит его к подтверждённой сумме товаров.` : ''}</p>
                    {errors.deliveryCost && <p id={`admin-delivery-error-${order.id}`} className="field-error" role="alert">{errors.deliveryCost}</p>}
                  </div>}
                </fieldset>
                {confirming && <><p className="checkout-hint">Веса всех позиций и доставка подтверждаются одним действием. После этого сервер пересчитает итог и попробует создать ссылку на оплату.</p><button type="submit" className="btn-primary" disabled={disabled}>{busyId === order.id ? 'Подтверждаем…' : 'Подтвердить все веса и доставку'}</button></>}
              </form>
              <section className="checkout-summary" aria-label={`Расчёт заказа ${order.id}`}>
                <div><span>{pendingWeights ? 'Товары · предварительно' : 'Товары'}</span><strong className="tabular">{formatRub(order.itemsSum)}</strong></div>
                <div><span>Доставка</span><strong className="tabular">{order.delivery.cost === null ? 'Не согласована' : formatRub(order.delivery.cost)}</strong></div>
                <div className="cart-total-line"><span>{confirming ? 'Предварительный итог' : 'Итого'}</span><strong className="cart-total-sum tabular">{order.total === null ? 'После согласования' : formatRub(order.total)}</strong></div>
              </section>
              {order.status === 'awaiting_payment' && <p className={'form-status-box' + (order.paymentError ? ' error' : '')}>{order.paymentError ? 'Ошибка создания оплаты. Заказ сохранён; создание ссылки можно повторить.' : order.paymentInitAt ? 'Создание платёжной ссылки выполняется. Обновите заказ; если попытка зависла, повторите её позже.' : order.paymentUrl ? 'Ссылка на оплату готова. Передайте покупателю страницу заказа вручную.' : 'Платёжная ссылка пока не создана.'}</p>}
              {!order.demo && <div className="admin-sync-status"><p className="checkout-hint">{order.onecSyncError ? `Не удалось синхронизировать с 1С (${order.onecSyncError}). Можно повторить вручную.` : order.onecSyncedAt ? `Синхронизировано с 1С: ${dateTime(order.onecSyncedAt)}.` : 'Синхронизация с 1С ожидает подтверждения.'}</p></div>}
              {order.status === 'paid' && <p className="checkout-hint">{order.demo ? 'Демо-оплата подтверждена; реальной отправки нет.' : 'Банк подтвердил оплату. Отправка ещё не подтверждена. Отмена и возврат выполняются через банк, не в этой панели.'}</p>}
              {!closed && !canCancel && <p className="checkout-hint">У заказа есть банковский платёж. Сначала отмените его в кабинете банка и дождитесь подтверждения: локальная отмена и снятие резерва здесь недоступны.</p>}
              <div className="checkout-actions">
                <a className="btn-secondary" href={pageUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Страница заказа</a>
                <button type="button" className="btn-secondary" disabled={disabled} onClick={() => { void copyOrder(order); }}>Скопировать ссылку на заказ</button>
                {order.status === 'awaiting_payment' && (order.paymentError || !order.paymentUrl) && <button type="button" className="btn-secondary" disabled={disabled} onClick={() => { void act(order.id, { action: 'retry-payment' }); }}>Повторить создание оплаты</button>}
                {!order.demo && (order.onecSyncError || !order.onecSyncedAt) && <button type="button" className="btn-secondary" disabled={disabled} onClick={() => { void act(order.id, { action: 'sync-onec' }); }}>Синхронизировать с 1С</button>}
                {canCancel && <button type="button" className="btn-secondary" disabled={disabled} onClick={() => { if (window.confirm(`Отменить заказ № ${order.id}?`)) void act(order.id, { action: 'cancel' }); }}>Отменить заказ</button>}
              </div>
              {busyId === order.id && <p className="checkout-hint" role="status">Выполняем действие…</p>}
              {message?.text && <p className={'form-status-box ' + message.kind} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
            </article>
          );
        })}
      </div>
    </main>
  );
}
