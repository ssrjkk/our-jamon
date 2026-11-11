'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useCart } from './CartContext';

const FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

/** Locks only the background, traps focus, and restores it for every dismissal path. */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    document.querySelectorAll<HTMLElement>('[popover]:popover-open').forEach((popover) => popover.hidePopover());
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const background: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = dialog;
    while (branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement) || sibling.hasAttribute('data-dialog-backdrop') || ['SCRIPT', 'STYLE'].includes(sibling.tagName)) continue;
        background.push({ element: sibling, inert: sibling.inert });
        sibling.inert = true;
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    document.body.style.overflow = 'hidden';
    const items = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length && !element.closest('[inert]'));
    (items()[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const focusable = items();
      const first = focusable[0] ?? dialog;
      const last = focusable[focusable.length - 1] ?? dialog;
      if (!focusable.length || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    const focusin = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) (items()[0] ?? dialog).focus();
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', focusin);
      document.body.style.overflow = overflow;
      background.forEach(({ element, inert }) => { element.inert = inert; });
      if (previousFocus?.isConnected && !previousFocus.closest('[inert],[hidden]')) previousFocus.focus({ preventScroll: true });
    };
  }, [open, ref, close]);
}

const NAV = [
  { href: '/catalog', title: 'Каталог' },
  { href: '/#scenarios', title: 'К столу и в подарок' },
  { href: '/#buyer-choices', title: 'Выбор покупателей' },
  { href: '/#shop', title: 'Наша лавка' },
  { href: '/about', title: 'О нас' },
  { href: '/#aging', title: 'Выдержка' },
  { href: '/#weight-system', title: 'Как считаем вес' },
  { href: '/#delivery', title: 'Доставка' },
];

export default function SiteHeader() {
  const { count } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setMenuOpen(false), []);
  useDialogFocus(menuOpen, drawerRef, close);

  return (
    <>
      <a className="skip-link" href="#main-content" onClick={(event) => {
        const main = document.querySelector<HTMLElement>('main');
        if (!main) return;
        event.preventDefault();
        main.tabIndex = -1;
        main.focus({ preventScroll: true });
        main.scrollIntoView({ block: 'start' });
      }}>Перейти к содержимому</a>
      <header className="site-header">
        <div className="container header-inner">
          <div className="menu-group">
            <button type="button" className="menu-toggle" aria-label="Открыть меню" aria-expanded={menuOpen}
              aria-controls="menu-drawer" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none"><path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
            <Link href="/" className="brand-link" aria-label="Наш Хамон — на главную">
              <img src="/brand/logo-horizontal.svg" alt="Наш Хамон" className="brand-logo" width="180" height="48" />
            </Link>
          </div>
          <nav className="main-nav" aria-label="Основная навигация">
            <Link href="/catalog">Каталог</Link>
            <a href="/#shop">Наша лавка</a>
            <Link href="/about">О нас</Link>
            <a href="/#delivery">Доставка</a>
          </nav>
          <Link href="/cart" className="cart-trigger" data-cart-trigger aria-label={`Корзина: ${count} товаров`}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"><path d="M5 8h14l1 12H4L5 8Z M8 8V6a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="1.5" /></svg>
            <span className="cart-trigger-label">Корзина</span><span className="cart-count-badge tabular" data-cart-badge>{count}</span>
          </Link>
        </div>
      </header>
      <div className={'menu-backdrop' + (menuOpen ? ' is-open' : '')} data-dialog-backdrop aria-hidden="true" onClick={close} />
      <div ref={drawerRef} id="menu-drawer" className={'menu-drawer' + (menuOpen ? ' is-open' : '')}
        role="dialog" aria-modal={menuOpen || undefined} aria-label="Меню лавки" aria-hidden={!menuOpen} inert={!menuOpen} tabIndex={-1}>
        <div className="menu-head">
          <img src="/brand/logo-stacked.svg" alt="Наш Хамон" className="brand-logo stacked" width="110" height="90" />
          <button type="button" className="story-close" onClick={close}>Закрыть</button>
        </div>
        <nav aria-label="Разделы лавки">
          {NAV.map((item) => !item.href.includes('#')
            ? <Link key={item.href} className="menu-link" href={item.href} onClick={close}>{item.title}</Link>
            : <a key={item.href} className="menu-link" href={item.href} onClick={close}>{item.title}</a>)}
        </nav>
        <div className="menu-foot">
          <a href="tel:+79068960099">+7 (906) 896-00-99</a>
          <span>Сытнинская, 4П · рынок «Сытный»</span>
          <span>Вт–вс, 10:30–20:30</span>
        </div>
      </div>
    </>
  );
}
