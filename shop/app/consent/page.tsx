import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Согласие на обработку персональных данных',
  description: 'Отдельный документ согласия субъекта на обработку персональных данных в лавке «Наш Хамон» (152-ФЗ).',
  alternates: { canonical: '/consent' },
};

export default function ConsentPage() {
  return (
    <main id="main-content">
      <section className="section about-intro">
        <div className="container">
          <nav className="breadcrumbs" aria-label="Хлебные крошки">
            <Link href="/">Главная</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Согласие на ПДн</span>
          </nav>
          <div className="section-head">
            <p className="bento-period">Отдельный документ · 2026-11-v1</p>
            <h1 className="section-title">Согласие на обработку персональных данных</h1>
            <p className="section-subtitle">Оформляется отдельно от публичной оферты и политики обработки персональных данных.</p>
          </div>
          <div className="about-facts-grid">
            <article>
              <h2 className="bento-title">Предмет согласия</h2>
              <p>Проставляя отметку в форме оформления заказа, я даю согласие ИП Маринову Виталию (ИНН 450164999507, ОГРНИП 316861700112850, <a href="mailto:619896@mail.ru">619896@mail.ru</a>) на обработку указанных мной имени, номера телефона и адреса доставки или пункта выдачи.</p>
            </article>
            <article>
              <h2 className="bento-title">Цели и действия</h2>
              <p>Цель — оформление и исполнение заказа, подтверждение фактического веса весовых позиций, проведение оплаты и фискализации в АО «ТБанк», передача отправления выбранной службе доставки. Разрешённые действия: сбор, запись, хранение на территории РФ, уточнение, использование, передача платёжному провайдеру и службе доставки, обезличивание и уничтожение.</p>
            </article>
            <article>
              <h2 className="bento-title">Срок и порядок отзыва</h2>
              <p>Согласие действует до достижения целей обработки или до отзыва, направленного на <a href="mailto:619896@mail.ru">619896@mail.ru</a>. Факт предоставления согласия фиксируется с отметкой времени и версией документа.</p>
            </article>
          </div>
          <div className="checkout-actions">
            <Link href="/privacy" className="btn-secondary">Политика ПДн</Link>
            <Link href="/offer" className="btn-secondary">Публичная оферта</Link>
            <Link href="/catalog" className="btn-primary">В каталог</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
