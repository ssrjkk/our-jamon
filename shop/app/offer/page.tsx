import type { Metadata } from 'next';
import Link from 'next/link';
import { CUT_RANGE } from '@/lib/price';

export const metadata: Metadata = {
  title: 'Публичная оферта',
  description: 'Условия дистанционной продажи продовольственных товаров и весовых деликатесов в лавке «Наш Хамон».',
  alternates: { canonical: '/offer' },
};

export default function OfferPage() {
  return (
    <main id="main-content">
      <section className="section about-intro">
        <div className="container">
          <nav className="breadcrumbs" aria-label="Хлебные крошки">
            <Link href="/">Главная</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Публичная оферта</span>
          </nav>
          <div className="section-head">
            <p className="bento-period">Редакция 2026-11-v1 · ПП РФ №&nbsp;657</p>
            <h1 className="section-title">Публичная оферта</h1>
            <p className="section-subtitle">Условия дистанционной продажи фасованных и весовых деликатесов лавки «Наш Хамон».</p>
          </div>
          <div className="about-facts-grid">
            <article>
              <h2 className="bento-title">1. Продавец</h2>
              <p>ИП Маринов Виталий, ИНН 450164999507, ОГРНИП 316861700112850. Торговая точка: Санкт-Петербург, Сытнинская площадь, д.&nbsp;4 литера&nbsp;А (в 2ГИС: Сытнинская ул., 4П), фуд-аллея рынка «Сытный». Телефон: <a href="tel:+79068960099">+7 (906) 896-00-99</a>, почта: <a href="mailto:619896@mail.ru">619896@mail.ru</a>.</p>
            </article>
            <article>
              <h2 className="bento-title">2. Весовые и фасованные товары</h2>
              <p>Для заводских фасовок с фиксированной ценой онлайн-оплата (банковская карта, T-Pay, СБП) доступна сразу либо при получении на самовывозе. Для весовых кусков и отрезов под заказ ({CUT_RANGE}) сумма в корзине предварительная: продавец взвешивает фактический кусок на контрольных весах (допуск ручного отреза ±15&nbsp;г) и подтверждает точную цену до рубля перед оплатой.</p>
            </article>
            <article>
              <h2 className="bento-title">3. Оплата, чеки и возврат</h2>
              <p>Онлайн-оплата принимается через эквайринг Т-Банка с выдачей электронного чека ФФД 1.2 (для маркированной продукции «Честный ЗНАК» формируются чек предоплаты и закрывающий чек при сборке). Покупатель вправе отказаться от заказа до его передачи. После передачи возврат и замена выполняются по правилам Закона РФ «О защите прав потребителей» и Постановления Правительства РФ №&nbsp;2461 с учётом категории товара и установленного срока годности; недостатки, несоответствие заказа и ошибки в весе или сумме подлежат рассмотрению. Для обращения свяжитесь с лавкой и сохраните чек.</p>
            </article>
          </div>
          <div className="checkout-actions">
            <Link href="/privacy" className="btn-secondary">Политика ПДн</Link>
            <Link href="/consent" className="btn-secondary">Согласие на ПДн</Link>
            <Link href="/catalog" className="btn-primary">В каталог</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
