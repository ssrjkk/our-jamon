'use client';

import { useRouter } from 'next/navigation';

export default function StoreError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return <main id="main-content" className="container section">
    <section className="cart-empty-state" role="alert">
      <h1 className="section-title">Не удалось загрузить магазин</h1>
      <p>Попробуйте ещё раз или свяжитесь с лавкой — поможем выбрать и оформить заказ.</p>
      <div className="hero-cta-row">
        <button type="button" className="btn-primary" onClick={() => { router.refresh(); reset(); }}>Повторить загрузку</button>
        <a className="btn-secondary" href="tel:+79068960099">+7 (906) 896-00-99</a>
      </div>
    </section>
  </main>;
}
