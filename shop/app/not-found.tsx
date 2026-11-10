import Link from 'next/link';

export default function NotFound() {
  return <main id="main-content" className="container section">
    <section className="cart-empty-state">
      <h1 className="section-title">Страница не найдена</h1>
      <p>Такой страницы в лавке нет: ссылка могла устареть или в адресе опечатка.</p>
      <div className="hero-cta-row">
        <Link href="/catalog" className="btn-primary">Открыть каталог</Link>
        <Link href="/" className="btn-secondary">На главную</Link>
      </div>
    </section>
  </main>;
}
