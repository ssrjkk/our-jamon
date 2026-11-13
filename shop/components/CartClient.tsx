'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { CartItemInput, CartQuote, DeliveryOption, Messenger } from '@/lib/types';
import { MAX_QTY_PER_LINE, MIN_QTY_PER_LINE, QTY_LIMIT_NOTE } from '@/lib/cart';
import { useCart, formatRub, formatUnitSummary } from './CartContext';

type Props = { deliveryOptions: DeliveryOption[]; freeFrom: number | null; demo: boolean };
type Field = 'name' | 'phone' | 'address' | 'consent';
type FieldErrors = Partial<Record<Field, string>>;
type QuoteResponse = { quote?: CartQuote; error?: string };

function applyPhoneMask(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (!digits.startsWith('7')) digits = '7' + digits;
  const local = digits.slice(1, 11);
  let value = '+7';
  if (local.length) value += ' (' + local.slice(0, 3);
  if (local.length >= 3) value += ')';
  if (local.length > 3) value += ' ' + local.slice(3, 6);
  if (local.length > 6) value += '-' + local.slice(6, 8);
  if (local.length > 8) value += '-' + local.slice(8, 10);
  return value;
}

export default function CartClient({ deliveryOptions, freeFrom, demo }: Props) {
  const router = useRouter();
  const { lines, count, ready, notice, setQuantity, removeLine, canUndoRemove, undoRemove, consumeLines, clear } = useCart();
  const [deliveryId, setDeliveryId] = useState('pickup');
  const [address, setAddress] = useState('');
  const [messenger, setMessenger] = useState<Messenger>('SMS');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<{ key: string; text: string } | null>(null);
  const [quoted, setQuoted] = useState<{ key: string; quote: CartQuote } | null>(null);
  const [quoteError, setQuoteError] = useState<{ key: string; text: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const currentKey = useRef('');
  const removedUid = useRef<string | null>(null);
  const pendingFocus = useRef<'undo' | 'remove' | null>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pendingFocus.current === 'undo' && canUndoRemove) {
      undoButtonRef.current?.focus();
      pendingFocus.current = null;
    } else if (pendingFocus.current === 'remove' && !canUndoRemove) {
      if (removedUid.current !== null) {
        document.getElementById(`cart-line-${removedUid.current}`)?.querySelector<HTMLButtonElement>('.cart-remove-btn')?.focus();
      }
      pendingFocus.current = null;
      removedUid.current = null;
    }
  }, [lines, canUndoRemove]);

  function handleRemove(uid: string) {
    removedUid.current = uid;
    pendingFocus.current = 'undo';
    removeLine(uid);
  }

  function handleUndo() {
    pendingFocus.current = 'remove';
    undoRemove();
  }

  const items = useMemo<CartItemInput[]>(() => lines.map((line) => ({
    productId: line.productId, kind: line.kind, pieceId1c: line.pieceId1c ?? undefined,
    packIdx: line.packIdx, weightG: line.weightG, qty: line.qty,
  })), [lines]);
  // Quote item UIDs are generated on the server. Match items by request order,
  // and include local UIDs in the key so replaced lines cannot reuse a quote.
  const requestBody = useMemo(() => JSON.stringify({ items, deliveryId }), [items, deliveryId]);
  const quoteKey = useMemo(() => JSON.stringify([requestBody, lines.map((line) => line.uid)]), [requestBody, lines]);
  const quote = quoted?.key === quoteKey ? quoted.quote : null;
  const calculationError = quoteError?.key === quoteKey ? quoteError.text : '';
  const submissionError = feedback?.key === quoteKey ? feedback.text : '';
  const delivery = deliveryOptions.find((option) => option.id === deliveryId);
  const isDemo = quote?.demo ?? demo;

  useEffect(() => {
    const controller = new AbortController();
    currentKey.current = quoteKey;
    setQuoted(null);
    setQuoteError(null);
    setFeedback(null);
    setErrors({});
    if (!ready || lines.length === 0) return () => controller.abort();
    async function calculate() {
      try {
        const response = await fetch('/api/cart', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: requestBody, cache: 'no-store', signal: controller.signal,
        });
        const data: QuoteResponse = await response.json();
        if (controller.signal.aborted || currentKey.current !== quoteKey) return;
        if (!response.ok || !data.quote || data.quote.items.length !== items.length || data.quote.delivery.id !== deliveryId) {
          throw new Error(data.error || 'Не удалось рассчитать корзину. Повторите расчёт.');
        }
        setQuoted({ key: quoteKey, quote: data.quote });
      } catch (error) {
        if (controller.signal.aborted || currentKey.current !== quoteKey) return;
        setQuoteError({ key: quoteKey, text: error instanceof Error ? error.message : 'Сеть недоступна. Повторите расчёт.' });
      }
    }
    void calculate();
    return () => controller.abort();
  }, [ready, quoteKey, requestBody, items.length, lines.length, deliveryId, retry]);

  function clearError(field: Field) {
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setFeedback(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setFeedback(null);
    const nextErrors: FieldErrors = {};
    if (!name.trim()) nextErrors.name = 'Укажите имя для связи.';
    if (!/^7\d{10}$/.test(phone.replace(/\D/g, ''))) nextErrors.phone = 'Введите +7 и все 10 цифр номера.';
    if (deliveryId !== 'pickup' && !address.trim()) nextErrors.address = 'Укажите адрес доставки или пункта выдачи.';
    if (!consent) nextErrors.consent = 'Для оформления нужно ваше согласие.';
    setErrors(nextErrors);
    const firstError = (['name', 'phone', 'address', 'consent'] as const).find((field) => nextErrors[field]);
    if (firstError) {
      document.getElementById(`checkout-${firstError}`)?.focus();
      return;
    }
    if (!quote || !delivery || currentKey.current !== quoteKey) {
      setFeedback({ key: quoteKey, text: 'Дождитесь актуального расчёта корзины.' });
      return;
    }
    const orderedLines = lines.map((line) => ({ ...line }));
    const submittedKey = quoteKey;
    submitting.current = true;
    setBusy(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { name: name.trim(), phone }, consent: true, deliveryId,
          deliveryAddress: deliveryId === 'pickup' ? '' : address.trim(), messenger, items,
          expectedItemsSum: quote.itemsSum, expectedDeliveryCost: quote.delivery.cost,
        }),
      });
      const data: QuoteResponse & { orderId?: string; accessToken?: string } = await response.json();
      if (!response.ok) {
        if (currentKey.current === submittedKey) {
          if (response.status === 409) {
            if (data.quote && data.quote.items.length === items.length && data.quote.delivery.id === deliveryId) {
              setQuoted({ key: submittedKey, quote: data.quote });
            } else {
              setQuoted(null);
              setQuoteError({ key: submittedKey, text: data.error || 'Состав корзины изменился. Повторите расчёт.' });
            }
          }
          setFeedback({ key: submittedKey, text: data.error || 'Не удалось оформить заказ. Попробуйте ещё раз или свяжитесь с лавкой.' });
        }
        return;
      }
      if (response.status !== 201 || !data.orderId || !data.accessToken) {
        throw new Error('Ответ о заказе не получен. Свяжитесь с лавкой перед повторным оформлением.');
      }
      consumeLines(orderedLines);
      router.push(`/order/${encodeURIComponent(data.orderId)}?token=${encodeURIComponent(data.accessToken)}`);
    } catch (error) {
      if (currentKey.current === submittedKey) {
        setFeedback({ key: submittedKey, text: error instanceof Error && error.message.startsWith('Ответ о заказе')
          ? error.message : 'Не удалось получить ответ. Если заказ мог быть принят, уточните это в лавке перед повторным оформлением.' });
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (!ready) {
    return <main id="main-content" className="container cart-page"><div className="cart-empty-state" role="status"><h1 className="section-title">Корзина</h1><p>Восстанавливаем ваш выбор…</p></div></main>;
  }
  if (count === 0) {
    return (
      <main id="main-content" className="container cart-page">
        <div className="cart-empty-state">
          <h1 className="section-title">Корзина пока пуста</h1>
          <p>Выберите кусок, нарезку или целую ногу в каталоге.</p>
          {notice && <p role="status">{notice}</p>}
          {canUndoRemove && <p className="cart-undo" role="status">Позиция удалена из корзины. <button type="button" className="cart-undo-btn" ref={undoButtonRef} onClick={handleUndo}>Вернуть</button></p>}
          <Link href="/catalog" className="btn-primary">Выбрать деликатесы</Link>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="container cart-page">
      <section aria-labelledby="cart-title">
        <header className="section-head">
          <p className="bento-period">Ваш выбор · {count}&nbsp;шт.</p>
          <h1 id="cart-title" className="section-title">Корзина</h1>
          <p className="cart-head-sub">Без регистрации. Весовые позиции проверим перед оплатой.</p>
        </header>
        {notice && <p className="form-status-box" role="status">{notice}</p>}
        {canUndoRemove && <p className="cart-undo" role="status">Позиция удалена из корзины. <button type="button" className="cart-undo-btn" ref={undoButtonRef} onClick={handleUndo}>Вернуть</button></p>}
        <div className="cart-items">
          {lines.map((line, index) => {
            const item = quote?.items[index];
            const unitLine = item ? formatUnitSummary(item) : '';
            return (
              <article key={line.uid} id={`cart-line-${line.uid}`} className="cart-item-row">
                <div className="cart-item-details">
                  <strong className="cart-item-title">{item?.title ?? line.title}</strong>
                  <span className="cart-item-sub">{item?.label ?? line.label}</span>
                  {unitLine && <span className="cart-item-sub">{unitLine}</span>}
                  <p className="cart-item-note">
                    {item ? item.requiresWeightCheck
                      ? item.pricePerKg === null ? 'Проверим вес; цена за штуку фиксирована.' : `Вес проверим; расчёт по ${formatRub(item.pricePerKg)} / кг.`
                      : 'Фиксированная фасовка и цена.' : 'Проверяем вес и цену по каталогу.'}
                  </p>
                  {line.kind === 'pack' && (
                    <div className="cart-line-controls">
                      <button type="button" disabled={busy || line.qty <= MIN_QTY_PER_LINE} onClick={() => setQuantity(line.uid, line.qty - 1)} aria-label={`Уменьшить количество: ${item?.title ?? line.title}`}>−</button>
                      <label htmlFor={`quantity-${line.uid}`}>Количество</label>
                      <input id={`quantity-${line.uid}`} type="number" className="tabular" inputMode="numeric" min={MIN_QTY_PER_LINE} max={MAX_QTY_PER_LINE} step={1} value={line.qty} disabled={busy} onChange={(event) => setQuantity(line.uid, Number(event.target.value))} />
                      <button type="button" disabled={busy || line.qty >= MAX_QTY_PER_LINE} onClick={() => setQuantity(line.uid, line.qty + 1)} aria-label={`Увеличить количество: ${item?.title ?? line.title}`}>+</button>
                      <span className="cart-item-note">{QTY_LIMIT_NOTE}</span>
                    </div>
                  )}
                </div>
                <div className="cart-item-price">
                  <strong className="tabular">{item ? formatRub(item.price * item.qty) : 'Уточняем…'}</strong>
                  <button type="button" className="cart-remove-btn" disabled={busy} onClick={() => handleRemove(line.uid)} aria-label={`Удалить из корзины: ${item?.title ?? line.title}`}>Удалить</button>
                </div>
              </article>
            );
          })}
        </div>
        <div className="checkout-actions">
          <Link href="/catalog" className="btn-secondary">Добавить ещё</Link>
          <button type="button" className="cart-remove-btn" disabled={busy} onClick={clear}>Очистить корзину</button>
        </div>
        {quote && <p className="scenario-banner">{quote.needsConfirmation
          ? 'Сначала согласуем весовые позиции и стоимость доставки. Оплата — только после подтверждения итоговой суммы.'
          : 'Сумма рассчитана. После оформления ссылка на оплату появится на странице заказа.'}</p>}
      </section>

      <aside className="cart-side" aria-labelledby="checkout-title">
        <form className="checkout-form" onSubmit={submit} noValidate aria-busy={busy}>
          <h2 id="checkout-title" className="checkout-title">Оформление</h2>
          <p className="checkout-hint">Получение, контакты и проверенный расчёт — в одном месте.</p>
          {isDemo && <p className="demo-note"><strong>Демонстрационный режим.</strong> Заказ не отправляется в реальный банк или 1С. Не вводите реальные персональные данные; используйте вымышленные контакты.</p>}
          <fieldset disabled={busy}>
            <legend>Как получить заказ</legend>
            <div className="delivery-radio-grid">
              {deliveryOptions.map((option) => (
                <label key={option.id} className={'delivery-option-btn' + (deliveryId === option.id ? ' is-selected' : '')}>
                  <input type="radio" name="delivery" value={option.id} checked={deliveryId === option.id} onChange={() => { setDeliveryId(option.id); clearError('address'); }} />
                  <strong>{option.name}</strong>
                  <span className="deliv-cost tabular">{quote?.delivery.id === option.id
                    ? quote.delivery.cost === null ? 'Согласуем до оплаты' : formatRub(quote.delivery.cost)
                    : option.cost === null ? 'Согласуем до оплаты' : formatRub(option.cost)}</span>
                  <span className="checkout-hint">{option.note}</span>
                  {option.freeEligible && freeFrom !== null && <span className="checkout-hint">Бесплатная доставка при подтверждённой сумме товаров от {formatRub(freeFrom)}.</span>}
                </label>
              ))}
            </div>
            {!delivery && <p className="form-status-box error" role="alert">Выберите доступный способ получения.</p>}
            {deliveryId !== 'pickup' && (
              <div className="form-field">
                <label htmlFor="checkout-address">{deliveryId === 'cdek' ? 'Город и адрес пункта выдачи СДЭК' : 'Адрес доставки'}</label>
                <input id="checkout-address" className="form-input" value={address} onChange={(event) => { setAddress(event.target.value); clearError('address'); }} placeholder={deliveryId === 'cdek' ? 'Город, улица, дом или код пункта выдачи' : 'Город, улица, дом, квартира'} autoComplete="street-address" maxLength={500} required aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? 'checkout-address-error' : undefined} />
                {errors.address && <p id="checkout-address-error" className="field-error" role="alert">{errors.address}</p>}
              </div>
            )}
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Контакты для заказа</legend>
            <div className="form-field">
              <label htmlFor="checkout-name">Ваше имя</label>
              <input id="checkout-name" className="form-input" value={name} onChange={(event) => { setName(event.target.value); clearError('name'); }} autoComplete="name" placeholder={isDemo ? 'Тестовый покупатель' : 'Как к вам обращаться'} maxLength={100} required aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'checkout-name-error' : undefined} />
              {errors.name && <p id="checkout-name-error" className="field-error" role="alert">{errors.name}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="checkout-phone">Телефон</label>
              <input id="checkout-phone" type="tel" className="form-input tabular" inputMode="tel" value={phone} onChange={(event) => { setPhone(applyPhoneMask(event.target.value)); clearError('phone'); }} onKeyDown={(event) => {
                const input = event.currentTarget;
                if (event.key === 'Backspace' && input.selectionStart === input.selectionEnd && input.selectionStart === phone.length && phone.endsWith(')')) {
                  event.preventDefault();
                  setPhone(applyPhoneMask(phone.replace(/\D/g, '').slice(0, -1)));
                  clearError('phone');
                }
              }} placeholder="+7 (___) ___-__-__" autoComplete="tel" maxLength={18} required aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'checkout-phone-error' : 'checkout-phone-hint'} />
              <p id="checkout-phone-hint" className="checkout-hint">Для уточнения заказа и оплаты.{isDemo ? ' В демо используйте вымышленный номер.' : ''}</p>
              {errors.phone && <p id="checkout-phone-error" className="field-error" role="alert">{errors.phone}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="checkout-messenger">Предпочтительный способ связи</label>
              <select id="checkout-messenger" className="form-input" value={messenger} onChange={(event) => setMessenger(event.target.value as Messenger)}>
                {(['Telegram', 'WhatsApp', 'SMS'] as const).map((option) => <option key={option}>{option}</option>)}
              </select>
              <p className="checkout-hint">Ссылку на оплату можно открыть на странице заказа. Способ связи укажем менеджеру.</p>
            </div>
          </fieldset>

          <section className="checkout-summary" aria-label="Расчёт заказа" aria-live="polite" aria-busy={!quote && !calculationError}>
            <div><span>{quote?.items.some((item) => item.requiresWeightCheck && !item.weightConfirmed) ? 'Товары · предварительно' : 'Товары'}</span><strong className="tabular">{quote ? formatRub(quote.itemsSum) : 'Уточняем…'}</strong></div>
            <div><span>Доставка</span><strong className="tabular">{quote ? quote.delivery.cost === null ? 'По согласованию' : formatRub(quote.delivery.cost) : 'Уточняем…'}</strong></div>
            <div className="cart-total-line"><span>{quote?.needsConfirmation ? 'Предварительный итог' : 'Итого'}</span><strong className="cart-total-sum tabular">{quote ? quote.total === null ? 'После согласования' : formatRub(quote.total) : 'Уточняем…'}</strong></div>
            {quote?.delivery.cost === null && <p className="checkout-hint">Стоимость доставки ещё не известна и не включена в сумму товаров. Согласуем её до оплаты.</p>}
            {quote?.needsConfirmation && quote.total !== null && <p className="checkout-hint">Итог проверим после взвешивания. Сейчас оплата не требуется.</p>}
            {!quote && !calculationError && <p className="checkout-hint" role="status">Проверяем доступность и цены…</p>}
          </section>
          {calculationError && <div className="form-status-box error" role="alert"><p>{calculationError}</p><button type="button" className="btn-secondary" disabled={busy} onClick={() => setRetry((value) => value + 1)}>Повторить расчёт</button></div>}
          <label className="consent-label" htmlFor="checkout-consent">
            <input id="checkout-consent" type="checkbox" checked={consent} disabled={busy} required onChange={(event) => { setConsent(event.target.checked); clearError('consent'); }} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? 'checkout-consent-error checkout-privacy' : 'checkout-privacy'} />
            <span>Согласен на обработку указанных данных для оформления и выполнения этого заказа.</span>
          </label>
          <details className="privacy-details" id="checkout-privacy"><summary>Какие данные используем и зачем</summary><p>Имя и телефон нужны для связи по заказу, адрес — для доставки. Сведения о заказе передаются в систему учёта, а данные для оплаты — платёжному сервису. В демо реальной передачи в банк и 1С нет. Ссылка на заказ открывает его детали: не публикуйте её.</p></details>
          {errors.consent && <p id="checkout-consent-error" className="field-error" role="alert">{errors.consent}</p>}
          {submissionError && <p className="form-status-box error" role="alert">{submissionError}</p>}
          <button type="submit" className="btn-primary" disabled={busy || !quote || !delivery || Boolean(calculationError)}>{busy ? 'Оформляем заказ…' : isDemo ? 'Оформить демо-заказ' : quote?.needsConfirmation ? 'Отправить на согласование' : 'Оформить и перейти к оплате'}</button>
          <p className="checkout-hint">Нужна помощь? <a href="tel:+79068960099">+7 (906) 896-00-99</a></p>
        </form>
      </aside>
    </main>
  );
}
