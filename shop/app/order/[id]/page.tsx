import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import MockPayButton from '@/components/MockPayButton';
import { getOrder, orderStatusRu } from '@/lib/orders';

export const metadata: Metadata = {
  title: 'Статус заказа',
  robots: { index: false },
};

export const instant = false;

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) {
    return (
      <main className="container">
        <div className="order-status-card">
          <h1 className="section-title">Заказ не найден</h1>
          <p className="section-subtitle">Проверьте номер заказа или позвоните нам: +7 (906) 896-00-99.</p>
          <Link href="/catalog" className="btn-primary">В каталог</Link>
        </div>
      </main>
    );
  }

  const paid = order.status === 'paid';
  const awaitingWeight = order.status === 'awaiting_weight';
  const cancelled = order.status === 'cancelled';
  const isMockPay = (order.paymentUrl || '').includes('mockpay=1');

  return (
    <main className="container">
      <div className="order-status-card">
        <h1 className="section-title">Заказ №&nbsp;{order.id}</h1>
        <p className="section-subtitle">{orderStatusRu(order.status)} · {order.delivery.name}{order.delivery.address ? ` · ${order.delivery.address}` : ''}</p>

        <div className="order-steps" aria-live="polite">
          <div className={'order-step' + (true ? ' is-done' : '')}>Заказ принят, куски зарезервированы на Сытном рынке</div>
          <div className={'order-step' + (!awaitingWeight && !cancelled ? ' is-done' : '')}>
            {awaitingWeight
              ? 'Взвешиваем куски - вес подтвердит менеджер лавки'
              : order.items.some((i) => i.requiresWeightCheck)
                ? 'Вес подтверждён: ' + order.items.filter((i) => i.requiresWeightCheck).map((i) => i.label).join(', ')
                : 'Фасованные позиции - взвешивание не требуется'}
          </div>
          <div className={'order-step' + (paid ? ' is-done' : '')}>
            {paid ? 'Оплачено - спасибо!' : order.status === 'awaiting_payment' ? 'Ожидаем оплату по ссылке Т-Банка' : 'Ссылка на оплату придёт в ' + order.messenger}
          </div>
          <div className={'order-step' + (paid ? ' is-done' : '')}>Сборка и отправка в день заказа</div>
        </div>

        <table className="admin-table">
          <thead>
            <tr><th>Позиция</th><th>Вес</th><th>Цена</th></tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.uid}>
                <td><strong>{i.title}</strong><br /><span style={{ color: 'var(--graphite-muted)', fontSize: '0.8125rem' }}>{i.label}</span></td>
                <td className="tabular">{i.weightG}{'\u00A0'}г</td>
                <td className="tabular">{i.price * (i.qty || 1)}{'\u00A0'}₽</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2}>Доставка: {order.delivery.name}</td>
              <td className="tabular">{order.delivery.cost}{'\u00A0'}₽</td>
            </tr>
            <tr>
              <td colSpan={2}><strong>Итого</strong></td>
              <td className="tabular"><strong>{order.total}{'\u00A0'}₽</strong></td>
            </tr>
          </tbody>
        </table>

        {!paid && !cancelled && order.paymentUrl && (
          isMockPay
            ? <MockPayButton orderId={order.id} />
            : <a className="btn-primary" href={order.paymentUrl} style={{ alignSelf: 'flex-start' }}>Оплатить в Т-Банке</a>
        )}
        {awaitingWeight && (
          <p className="footer-caption">
            Ссылка на оплату точной суммы придёт в {order.messenger} сразу после подтверждения веса. Обычно это занимает 15-30 минут в часы работы лавки.
          </p>
        )}
        {cancelled && (
          <p className="footer-caption">Заказ отменён. Если это ошибка - позвоните нам: +7 (906) 896-00-99.</p>
        )}
        <p className="footer-caption">Контакты: <a href="tel:+79068960099">+7 (906) 896-00-99</a> · Сытнинская ул., 4П, вт-вс 10:30-20:30</p>
      </div>
    </main>
  );
}
