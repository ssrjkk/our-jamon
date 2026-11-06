'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCart, formatRub } from './CartContext';

// Корзина + оформление: без регистрации, имя + телефон, доставка из СПб,
// два сценария оплаты (фасовка сразу / весовые - после подтверждения веса).
// ЗАМЕНИТЬ: порог бесплатной доставки согласовать (сейчас 3000 ₽)
const FREE_DELIVERY_FROM = 3000;

const DELIVERY = [
  { id: 'cdek', name: 'СДЭК (ПВЗ)', cost: 290 },
  { id: 'yandex', name: 'Яндекс Доставка', cost: 350 },
  { id: 'drivee', name: 'Drivee Курьер', cost: 300 },
  { id: 'pickup', name: 'Самовывоз СПб', cost: 0 },
];

export default function CartClient() {
  const router = useRouter();
  const { lines, sum, count, hasWeightCheck, removeLine, clear } = useCart();
  const [deliveryId, setDeliveryId] = useState('cdek');
  const [pvz, setPvz] = useState('Санкт-Петербург, Большой пр. П.С., 34 [заглушка ПВЗ]');
  const [address, setAddress] = useState('');
  const [messenger, setMessenger] = useState<'Telegram' | 'WhatsApp' | 'SMS'>('Telegram');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const delivery = DELIVERY.find((d) => d.id === deliveryId)!;
  const isCourier = deliveryId === 'yandex' || deliveryId === 'drivee';
  const deliveryCost = isCourier && sum >= FREE_DELIVERY_FROM ? 0 : delivery.cost;
  const total = sum + deliveryCost;

  function applyPhoneMask(raw: string): string {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('8')) digits = '7' + digits.slice(1);
    if (!digits.startsWith('7')) digits = '7' + digits;
    digits = digits.slice(0, 11);
    let out = '+7';
    if (digits.length > 1) out += ' (' + digits.slice(1, 4);
    if (digits.length >= 4) out += ') ' + digits.slice(4, 7);
    if (digits.length >= 7) out += '-' + digits.slice(7, 9);
    if (digits.length >= 9) out += '-' + digits.slice(9, 11);
    return out;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const phoneDigits = phone.replace(/\D/g, '');
    if (!name.trim()) {
      setFeedback({ kind: 'error', text: 'Укажите ваше имя, чтобы мы знали, к кому обращаться.' });
      return;
    }
    if (phoneDigits.length !== 11) {
      setFeedback({ kind: 'error', text: 'Введите полный номер телефона с кодом оператора (+7 и 10 цифр).' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { name: name.trim(), phone },
          deliveryId,
          deliveryAddress: deliveryId === 'cdek' ? pvz : address,
          messenger,
          items: lines.map((l) => ({
            productId: l.productId,
            kind: l.kind,
            pieceId1c: l.pieceId1c ?? undefined,
            packIdx: l.packIdx,
            weightG: l.weightG,
            qty: l.qty,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ kind: 'error', text: data.error || 'Не удалось оформить заказ. Позвоните нам: +7 (906) 896-00-99.' });
        return;
      }
      clear();
      router.push(`/order/${data.orderId}`);
    } catch {
      setFeedback({ kind: 'error', text: 'Сеть недоступна. Попробуйте ещё раз или позвоните: +7 (906) 896-00-99.' });
    } finally {
      setBusy(false);
    }
  }

  if (count === 0) {
    return (
      <main className="container cart-page">
        <div className="cart-empty-state" style={{ gridColumn: '1/-1' }}>
          <p>В корзине пока нет деликатесов.</p>
          <Link href="/catalog" className="btn-primary">Выбрать кусок</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container cart-page">
      <section aria-label="Состав заказа">
        <h1 className="section-title" style={{ marginBottom: 20 }}>Корзина</h1>
        <p className="cart-head-sub" style={{ marginBottom: 20, color: 'var(--graphite-muted)', fontSize: '0.875rem' }}>
          Без регистрации и личного кабинета
        </p>
        <div className="cart-items">
          {lines.map((l) => (
            <div key={l.uid} className="cart-item-row">
              <div>
                <strong className="cart-item-title">{l.title}</strong>
                <span className="cart-item-sub">{l.label}{l.qty > 1 ? ` × ${l.qty}` : ''}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong className="tabular" style={{ display: 'block' }}>{formatRub(l.price * l.qty)}</strong>
                <button type="button" className="cart-remove-btn" onClick={() => removeLine(l.uid)}>Удалить</button>
              </div>
            </div>
          ))}
        </div>
        <div className="scenario-banner" style={{ marginTop: 16 }}>
          {hasWeightCheck
            ? `В заказе есть весовой кусок или развес. Менеджер подтвердит вес на складе, и мы пришлём ссылку на оплату в ${messenger}.`
            : 'В корзине только фиксированные упаковки. Сразу после оформления откроется платёжная страница Т-Банка.'}
        </div>
      </section>

      <aside className="cart-side" aria-label="Оформление заказа">
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-field">
            <label htmlFor="cust-name">Ваше имя</label>
            <input id="cust-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Алексей" autoComplete="name" />
          </div>
          <div className="form-field">
            <label htmlFor="cust-phone">Телефон для связи и ссылки на оплату</label>
            <input id="cust-phone" className="form-input tabular" inputMode="tel" value={phone} onChange={(e) => setPhone(applyPhoneMask(e.target.value))} placeholder="+7 (___) ___-__-__" autoComplete="tel" />
          </div>
          <div className="form-field">
            <label id="deliv-label">Способ доставки из Санкт-Петербурга</label>
            <div className="delivery-radio-grid" role="radiogroup" aria-labelledby="deliv-label">
              {DELIVERY.map((d) => {
                const free = (d.id === 'yandex' || d.id === 'drivee') && sum >= FREE_DELIVERY_FROM;
                return (
                  <button
                    key={d.id}
                    type="button"
                    className="delivery-option-btn"
                    role="radio"
                    aria-checked={deliveryId === d.id}
                    onClick={() => setDeliveryId(d.id)}
                  >
                    <strong>{d.name}</strong>
                    <span className={'deliv-cost tabular' + (free ? ' is-free' : '')}>
                      {free ? 'бесплатно' : d.cost === 0 ? '0\u00A0₽' : `от ${formatRub(d.cost)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {deliveryId === 'cdek' && (
            <div className="form-field">
              <label htmlFor="pvz">Пункт выдачи СДЭК</label>
              <div className="pvz-row">
                {/* ИНТЕГРАЦИЯ СДЭК: виджет ISDEKWidjet вместо заглушки */}
                <input id="pvz" className="form-input" value={pvz} onChange={(e) => setPvz(e.target.value)} />
              </div>
            </div>
          )}
          {isCourier && (
            <div className="form-field">
              <label htmlFor="addr">Адрес доставки в Санкт-Петербурге</label>
              <input id="addr" className="form-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Улица, дом, квартира или офис" autoComplete="street-address" />
            </div>
          )}
          {hasWeightCheck && (
            <div className="form-field">
              <label id="msgr-label">Куда прислать ссылку на оплату</label>
              <div className="messenger-row" role="group" aria-labelledby="msgr-label">
                {(['Telegram', 'WhatsApp', 'SMS'] as const).map((m) => (
                  <button key={m} type="button" className="messenger-chip" aria-pressed={messenger === m} onClick={() => setMessenger(m)}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
          {feedback && <div className={'form-status-box ' + feedback.kind} role="status">{feedback.text}</div>}
          <div className="cart-total-line">
            <span style={{ fontSize: '0.875rem', color: 'var(--graphite-muted)' }}>Итого с доставкой:</span>
            <strong className="cart-total-sum tabular">{formatRub(total)}</strong>
          </div>
          <button type="submit" className="btn-primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Отправляем заказ…' : hasWeightCheck ? 'Отправить на проверку веса' : 'Перейти к оплате'}
          </button>
        </form>
      </aside>
    </main>
  );
}
