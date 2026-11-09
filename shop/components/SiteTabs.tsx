'use client';

import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';

export type TabId = 'catalog' | 'scenarios' | 'buyer-choices' | 'aging' | 'weight-system' | 'shop' | 'delivery';
const TABS: { id: TabId; label: string }[] = [
  { id: 'catalog', label: 'Каталог' },
  { id: 'scenarios', label: 'К столу и в подарок' },
  { id: 'buyer-choices', label: 'Выбор покупателей' },
  { id: 'shop', label: 'Наша лавка' },
  { id: 'aging', label: 'Выдержка' },
  { id: 'weight-system', label: 'Как считаем вес' },
  { id: 'delivery', label: 'Доставка' },
];
const TAB_EVENT = 'nh-tab-navigation';
function tabFromHash(hash: string): TabId {
  return TABS.find((tab) => `#${tab.id}` === hash)?.id ?? 'catalog';
}

/** Client actions and ordinary same-page anchors share one history-aware navigation. */
export function navigateToTab(id: TabId) {
  if (typeof window === 'undefined') return;
  if (!document.getElementById(`tab-${id}`)) {
    window.location.assign(`/#${id}`);
    return;
  }
  if (window.location.hash !== `#${id}`) {
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}#${id}`);
  }
  window.dispatchEvent(new CustomEvent(TAB_EVENT, { detail: id }));
}

export default function SiteTabs({ panels }: { panels: Record<TabId, ReactNode> }) {
  const [active, setActive] = useState<TabId>('catalog');
  const select = useCallback((id: TabId, scroll: boolean) => {
    setActive(id);
    if (scroll) requestAnimationFrame(() => {
      document.getElementById('shop-tabs')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      document.getElementById(`tab-${id}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, []);

  useEffect(() => {
    const sync = () => select(tabFromHash(window.location.hash), Boolean(window.location.hash));
    const custom = (event: Event) => {
      const id = (event as CustomEvent<TabId>).detail;
      if (TABS.some((tab) => tab.id === id)) select(id, true);
    };
    const anchors = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
      const tab = TABS.find((item) => url.hash === `#${item.id}`);
      if (!tab) return;
      event.preventDefault();
      navigateToTab(tab.id);
    };
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    window.addEventListener(TAB_EVENT, custom);
    document.addEventListener('click', anchors, true);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
      window.removeEventListener(TAB_EVENT, custom);
      document.removeEventListener('click', anchors, true);
    };
  }, [select]);

  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    navigateToTab(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus({ preventScroll: true });
  }

  return (
    <div className="shop-sections">
      <div className="site-tabs-wrap" id="shop-tabs">
        <div className="container site-tabs" role="tablist" aria-label="Разделы лавки" aria-orientation="horizontal">
          {TABS.map((tab, index) => (
            <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-controls={tab.id}
              aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1}
              onKeyDown={(event) => keyboard(event, index)} onClick={() => navigateToTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {TABS.map((tab) => (
        <div key={tab.id} id={tab.id} role="tabpanel" aria-labelledby={`tab-${tab.id}`} tabIndex={0} hidden={active !== tab.id}>
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
