import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Политика обработки персональных данных',
  description: 'Политика в отношении обработки персональных данных покупателей лавки «Наш Хамон» по 152-ФЗ.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <main id="main-content">
      <section className="section about-intro">
        <div className="container">
          <nav className="breadcrumbs" aria-label="Хлебные крошки">
            <Link href="/">Главная</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Политика ПДн</span>
          </nav>
          <div className="section-head">
            <p className="bento-period">Редакция 2026-11-v1 · 152-ФЗ</p>
            <h1 className="section-title">Политика обработки персональных данных</h1>
            <p className="section-subtitle">Порядок сбора, хранения и защиты данных покупателей ИП Маринова Виталия.</p>
          </div>
          <div className="about-facts-grid">
            <article>
              <h2 className="bento-title">1. Оператор и состав данных</h2>
              <p>Оператор: ИП Маринов Виталий (ИНН 450164999507, ОГРНИП 316861700112850, адрес регистрации: 628433, ХМАО, Сургутский р-н, пос. Белый Яр, ул. Некрасова, д.&nbsp;1А, кв.&nbsp;130). Обрабатываются только данные, переданные при оформлении заказа: имя, номер телефона, способ связи и адрес доставки или пункта выдачи.</p>
            </article>
            <article>
              <h2 className="bento-title">2. Цели и передача</h2>
              <p>Данные используются исключительно для исполнения заказа, согласования фактического веса, направления фискального чека через платёжного провайдера (АО «ТБанк») и организации доставки (СДЭК, Яндекс Доставка, Drivee). Рекламные рассылки без отдельного согласия не ведутся.</p>
            </article>
            <article>
              <h2 className="bento-title">3. Локализация и отзыв</h2>
              <p>Сбор, запись и хранение персональных данных осуществляются в базах данных на территории Российской Федерации (ч.&nbsp;5 ст.&nbsp;18, 152-ФЗ). Данные хранятся в течение срока исполнения договора и обязательного хранения фискальной документации. Отозвать согласие можно письмом на <a href="mailto:619896@mail.ru">619896@mail.ru</a>.</p>
            </article>
          </div>
          <div className="checkout-actions">
            <Link href="/consent" className="btn-secondary">Текст согласия</Link>
            <Link href="/offer" className="btn-secondary">Публичная оферта</Link>
            <Link href="/catalog" className="btn-primary">В каталог</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
