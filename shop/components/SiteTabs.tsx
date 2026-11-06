'use client';

import { useState } from 'react';

// Вкладки главной: контент меняется мгновенно, никакой длинной ленты.
export type TabId = 'catalog' | 'scenarios' | 'aging' | 'weight-system' | 'delivery';

const TABS: { id: TabId; label: string }[] = [
  { id: 'catalog', label: 'Витрина' },
  { id: 'scenarios', label: 'Сценарии' },
  { id: 'aging', label: 'Про выдержку' },
  { id: 'weight-system', label: 'Как считаем вес' },
  { id: 'delivery', label: 'Доставка' },
];

export default function SiteTabs({ panels }: { panels: Record<TabId, React.ReactNode> }) {
  const [active, setActive] = useState<TabId>('catalog');

  return (
    <div>
      <div className="site-tabs" role="tablist" aria-label="Разделы сайта">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div key={t.id} hidden={active !== t.id}>
          {panels[t.id]}
        </div>
      ))}
    </div>
  );
}
