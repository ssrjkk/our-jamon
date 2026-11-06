'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useCart } from './CartContext';

// Шапка: настоящий логотип лавки, сэндвич-меню на мобильных, счётчик корзины.
export default function SiteHeader() {
  const { count } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <div className="menu-group">
            <button
              type="button"
              ref={toggleRef}
              className="menu-toggle"
              aria-label="Открыть меню"
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              onClick={() => setMenuOpen(true)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
                <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>Меню</span>
            </button>
            <Link href="/" className="brand-link" aria-label="Наш Хамон — на главную">
              {/* ЗАМЕНИТЬ: SVG-логотип из брендбука, горизонтальная версия */}
              <img src="/brand/logo-horizontal.svg" alt="Наш Хамон — лавка деликатесов" className="brand-logo" />
            </Link>
          </div>
          <nav className="main-nav" aria-label="Основная навигация">
            <Link href="/catalog">Витрина</Link>
            <Link href="/#scenarios">Сценарии</Link>
            <Link href="/#weight-system">Как считаем вес</Link>
            <Link href="/#delivery">Доставка</Link>
          </nav>
          <Link href="/cart" className="cart-trigger" aria-label="Открыть корзину">
            <span>Корзина</span>
            <span className="cart-count-badge tabular">{count}</span>
          </Link>
        </div>
      </header>

      <div
        className={'menu-backdrop' + (menuOpen ? ' is-open' : '')}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />
      <nav
        id="menu-drawer"
        className={'menu-drawer' + (menuOpen ? ' is-open' : '')}
        role="dialog"
        aria-modal="true"
        aria-label="Меню сайта"
        aria-hidden={!menuOpen}
      >
        <div className="menu-head">
          <img src="/brand/logo-stacked.svg" alt="Наш Хамон" className="brand-logo stacked" />
          <button type="button" className="story-close" aria-label="Закрыть меню" onClick={() => { setMenuOpen(false); toggleRef.current?.focus(); }}>
            Закрыть
          </button>
        </div>
        <Link className="menu-link" href="/catalog" onClick={() => setMenuOpen(false)}>Витрина и куски</Link>
        <Link className="menu-link" href="/#scenarios" onClick={() => setMenuOpen(false)}>Сценарии</Link>
        <Link className="menu-link" href="/#weight-system" onClick={() => setMenuOpen(false)}>Как считаем вес</Link>
        <Link className="menu-link" href="/#delivery" onClick={() => setMenuOpen(false)}>Доставка и оплата</Link>
        <div className="menu-foot">
          <a href="tel:+79068960099" className="tabular">+7 (906) 896-00-99</a>
          <span>Сытнинская ул., 4П, рынок «Сытный»</span>
          <span className="tabular">вт–вс, 10:30–20:30</span>
        </div>
      </nav>
    </>
  );
}
