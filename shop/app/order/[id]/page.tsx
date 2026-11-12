import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import MockPayButton from '@/components/MockPayButton';
import { isDemoMode } from '@/lib/config';
import { getAuthorizedOrder } from '@/lib/order-access';
import { orderStatusRu } from '@/lib/orders';

export const metadata: Metadata = {
  title: 'Статус заказа',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const instant = false;

const rub = (amount: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(amount);
const grams = (weight: number) => `${new Intl.NumberFormat('ru-RU').format(weight)}\u00a0г`;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OrderPage({ params, searchParams }: Props) {
  await connection();
  const { id } = await params;
  const query = await searchParams;
  const token = typeof query.token === 'string' ? query.token : undefined;
  const order = await getAuthorizedOrder(id, token);
  if (!order) notFound();

  const paid = order.status === 'paid';
  const confirming = order.status === 'awaiting_confirmation';
  const cancelled = order.status === 'cancelled';
  const weighted = order.items.filter((item) => item.requiresWeightCheck);
  const weightsConfirmed = weighted.every((item) => item.weightConfirmed);
  const estimated = confirming || !weightsConfirmed;
  const activeDemo = isDemoMode();
  const modeMatches = order.demo === activeDemo;
  const paymentReady = order.status === 'awaiting_payment' && weightsConfirmed && order.total !== null && order.delivery.cost !== null;
  const demoPayment = paymentReady && order.demo && activeDemo && Boolean(order.paymentId?.startsWith('DEMO-')) && !order.paymentError;
  const realPayment = paymentReady && !order.demo && modeMatches && !order.paymentError && Boolean(order.paymentUrl?.startsWith('https://'));
  // The payment API rejects concurrent initializations for one minute.
  const paymentInitializing = Boolean(order.paymentInitAt && Date.now() - Date.parse(order.paymentInitAt) < 60000);
  const retryPayment = paymentReady && modeMatches && (order.paymentError || (!order.paymentUrl && !paymentInitializing));

  return (
    <main id="main-content" className="container order-page">
      <article className="order-status-card" aria-labelledby="order-title">
        <header className="order-header">
          <p className="section-eyebrow">Ваш заказ</p>
          <h1 id="order-title" className="section-title">Заказ № {order.id}</h1>
          <p className={'status-chip ' + order.status}>{orderStatusRu(order.status)}</p>
          <p className="checkout-hint"><time dateTime={order.createdAt}>{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(order.createdAt))}</time> · время Москвы</p>
        </header>
        {order.demo && <p className="demo-note"><strong>Демонстрационный заказ.</strong> Реальной оплаты, отправки в банк и 1С нет. Не вводите реальные персональные данные и не используйте этот заказ для реальной покупки.</p>}
        {cancelled ? (
          <p className="form-status-box">Заказ отменён. Оплата на этой странице недоступна. Если это ошибка, свяжитесь с лавкой.</p>
        ) : (
          <section aria-labelledby="order-next-title">
            <h2 id="order-next-title" className="checkout-title">{paid ? order.demo ? 'Демо-оплата подтверждена' : 'Оплата подтверждена' : confirming ? 'Сначала согласуем детали' : 'Заказ готов к оплате'}</h2>
            <ol className="order-steps">
              <li className="order-step is-done">Заказ сохранён. Его состав и расчёт — ниже.</li>
              <li className={'order-step' + (!confirming && weightsConfirmed && order.delivery.cost !== null ? ' is-done' : '')}>
                {confirming ? 'Менеджер проверит весовые позиции и согласует доставку до оплаты.'
                  : weighted.length ? weightsConfirmed ? 'Вес всех весовых позиций подтверждён.' : 'Весовые позиции ещё требуют проверки.' : 'Фасованные позиции не требуют проверки веса.'}
              </li>
              <li className={'order-step' + (paid ? ' is-done' : '')}>
                {paid ? order.demo ? 'Демо-оплата подтверждена сервером. Деньги не списывались.' : 'Банк подтвердил оплату.'
                  : confirming ? 'После согласования итоговой суммы ссылка на оплату появится здесь.'
                    : order.paymentError ? 'Не удалось создать ссылку на оплату. Можно повторить попытку ниже.' : paymentInitializing ? 'Ссылка на оплату формируется. Обновите статус чуть позже.' : 'Ожидаем оплату. Используйте кнопку ниже, если она доступна.'}
              </li>
              <li className="order-step">{order.demo ? 'Реальная сборка и отправка в демо не выполняются.' : paid ? 'Оплата не означает отправку. Получение или доставку согласует менеджер.' : 'Получение и доставку согласуем отдельно; отправка ещё не подтверждена.'}</li>
            </ol>
          </section>
        )}

        <section aria-labelledby="order-items-title">
          <h2 id="order-items-title" className="checkout-title">Состав заказа</h2>
          <div className="cart-items">
            {order.items.map((item) => (
              <div key={item.uid} className="cart-item-row">
                <div className="cart-item-details">
                  <strong className="cart-item-title">{item.title}</strong>
                  <span className="cart-item-sub">{item.label}</span>
                  <p className="cart-item-note tabular">{item.qty} шт.{item.weightG > 0 ? ` · ${grams(item.weightG)} за шт.${item.qty > 1 ? ` · всего ${grams(item.weightG * item.qty)}` : ''}` : ''}</p>
                  <p className="cart-item-note">{item.requiresWeightCheck
                    ? item.weightConfirmed ? 'Фактический вес подтверждён.' : 'Предварительный вес: проверим перед оплатой.'
                    : 'Фиксированная фасовка.'} {item.pricePerKg === null ? `Фиксированная цена за штуку: ${rub(item.price)}.` : `Цена по весу: ${rub(item.pricePerKg)} / кг.`}</p>
                </div>
                <div className="cart-item-price"><strong className="tabular">{rub(item.price * item.qty)}</strong><p className="cart-item-note">{item.requiresWeightCheck && !item.weightConfirmed && item.pricePerKg !== null ? 'Предварительно' : 'За позицию'}</p></div>
              </div>
            ))}
          </div>
        </section>
        <section className="order-delivery" aria-labelledby="order-delivery-title">
          <h2 id="order-delivery-title" className="checkout-title">Получение</h2>
          <p><strong>{order.delivery.name}</strong>{order.delivery.address ? ` · ${order.delivery.address}` : ''}</p>
          {order.delivery.id === 'pickup' && <p className="checkout-hint">Сытнинская ул., 4П · вт–вс 10:30–20:30. Готовность заказа уточните в лавке.</p>}
          <p className="checkout-hint">Предпочтительный способ связи: {order.messenger}. Ссылка на оплату доступна на этой странице после согласования.</p>
          {order.delivery.freeFrom !== null && <p className="checkout-hint">Порог бесплатной доставки для этого заказа: {rub(order.delivery.freeFrom)} по подтверждённой сумме товаров.{order.delivery.baseCost !== null ? ` Стоимость до применения порога: ${rub(order.delivery.baseCost)}.` : ''}</p>}
        </section>
        <section className="checkout-summary" aria-label="Стоимость заказа">
          <div><span>{estimated ? 'Товары · предварительно' : 'Товары'}</span><strong className="tabular">{rub(order.itemsSum)}</strong></div>
          <div><span>Доставка</span><strong className="tabular">{order.delivery.cost === null ? 'Нужно согласовать' : rub(order.delivery.cost)}</strong></div>
          <div className="cart-total-line"><span>{estimated ? 'Предварительный итог' : 'Итого'}</span><strong className="cart-total-sum tabular">{order.total === null ? 'После согласования' : rub(order.total)}</strong></div>
          {order.delivery.cost === null && <p className="checkout-hint">Доставка не включена в сумму товаров: её стоимость пока неизвестна. Оплата станет доступна после согласования.</p>}
          {estimated && order.total !== null && <p className="checkout-hint">Это расчёт до окончательного подтверждения. Оплата сейчас не требуется.</p>}
        </section>
        {!cancelled && !paid && !modeMatches && <p className="form-status-box" role="status">Заказ создан в другом режиме магазина. Оплата здесь недоступна; свяжитесь с лавкой.</p>}
        {realPayment && <a className="btn-primary" href={order.paymentUrl} rel="noreferrer" referrerPolicy="no-referrer">Оплатить в Т-Банке · {rub(order.total!)}</a>}
        {demoPayment && <MockPayButton orderId={order.id} token={order.accessToken} action="demo-pay" />}
        {retryPayment && <div className="order-payment-retry"><p className="form-status-box error" role="alert">Ссылка на оплату недоступна. Заказ сохранён; оформлять его заново не нужно.</p><MockPayButton orderId={order.id} token={order.accessToken} action="retry-payment" /></div>}
        {!cancelled && !paid && !confirming && !paymentReady && <p className="form-status-box">Оплата ещё недоступна: нужно подтвердить вес и стоимость доставки. Свяжитесь с лавкой.</p>}
        <div className="checkout-actions">
          <a href={`/order/${encodeURIComponent(order.id)}?token=${encodeURIComponent(order.accessToken)}`} className="btn-secondary" referrerPolicy="no-referrer">Обновить статус</a>
          <Link href="/catalog" className="btn-secondary">В каталог</Link>
        </div>
        <p className="privacy-details">Эта ссылка открывает сведения о заказе. Сохраните её и не публикуйте.</p>
        <p className="footer-caption">Вопросы по заказу: <a href="tel:+79068960099">+7 (906) 896-00-99</a></p>
      </article>
    </main>
  );
}
