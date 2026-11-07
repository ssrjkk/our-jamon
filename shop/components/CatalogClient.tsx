'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Product } from '@/lib/types';
import { CATEGORY_TITLES, DEPT_ORDER, COUNTRY_NAMES } from '@/lib/products';
import ProductCard from './ProductCard';

// Витрина: отделы с заголовками, липкая панель отделов со scrollspy,
// фильтры по стране и выдержке.
export default function CatalogClient({ products, serverReservedPieceIds }: { products: Product[]; serverReservedPieceIds: string[] }) {
  const searchParams = useSearchParams();
  const [country, setCountry] = useState<'all' | string>('all');
  const [aging, setAging] = useState<'all' | string>('all');
  const [activeDept, setActiveDept] = useState('dept-piece');

  // Из карточек выдержки на главной: /catalog?aging=24
  useEffect(() => {
    const a = searchParams.get('aging');
    if (a) setAging(a);
  }, [searchParams]);

  const matches = useMemo(() => {
    return products.filter((p) => {
      if (country !== 'all') {
        if (country === 'frch') {
          if (p.country !== 'fr' && p.country !== 'ch') return false;
        } else if (p.country !== country) return false;
      }
      if (aging !== 'all') {
        if (!p.agingMonths) return false;
        if (aging === '8-12' && (p.agingMonths < 8 || p.agingMonths > 12)) return false;
        if (aging === '14-18' && (p.agingMonths < 14 || p.agingMonths > 18)) return false;
        if (aging === '24' && p.agingMonths < 24) return false;
      }
      return true;
    });
  }, [products, country, aging]);

  function jumpToDept(id: string) {
    setActiveDept(id);
  }

  const dept = DEPT_ORDER.filter((d) => d.id === activeDept)[0] || DEPT_ORDER[0];
  const deptItems = matches.filter((p) => p.category === dept.cat);

  const agingBtn = (val: 'all' | string, label: string) => (
    <button type="button" className="filter-btn tabular" aria-pressed={aging === val} onClick={() => setAging(val)}>{label}</button>
  );

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 64 }}>

      <div className="catalog-controls">
        <div className="filter-row" role="group" aria-label="Фильтр по стране происхождения">
          <span className="filter-label">Страна:</span>
          <button type="button" className="filter-btn" aria-pressed={country === 'all'} onClick={() => setCountry('all')}>Все страны</button>
          {(['ru', 'es', 'it', 'gr', 'frch'] as const).map((c) => (
            <button key={c} type="button" className="filter-btn" aria-pressed={country === c} onClick={() => setCountry(c)}>
              <Flag code={c} />
              {c === 'frch' ? 'Франция и Швейцария' : COUNTRY_NAMES[c]}
            </button>
          ))}
        </div>
        <div className="filter-row" role="group" aria-label="Фильтр по выдержке хамона">
          <span className="filter-label">Выдержка:</span>
          {agingBtn('all', 'Любая')}
          {agingBtn('8-12', '8–12 мес')}
          {agingBtn('14-18', '14–18 мес')}
          {agingBtn('24', '24+ мес')}
        </div>
      </div>


      <div className="dept-tabs" role="tablist" aria-label="Отделы витрины">
        {DEPT_ORDER.map(({ cat, id }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-pressed={activeDept === id}
            onClick={() => jumpToDept(id)}
          >
            {CATEGORY_TITLES[cat].title}
            {matches.filter((p) => p.category === cat).length > 0
              ? ` · ${matches.filter((p) => p.category === cat).length}`
              : ''}
          </button>
        ))}
      </div>

      {deptItems.length === 0 ? (
        <div className="cart-empty-state" style={{ maxWidth: 640 }}>
          <p>В этом отделе пока пусто при текущих фильтрах.</p>
          <button type="button" className="btn-primary" onClick={() => { setCountry('all'); setAging('all'); }}>
            Показать все товары
          </button>
        </div>
      ) : (
        <div className="dept-section" id={dept.id}>
          <div className="dept-head">
            <h2 className="dept-title">{CATEGORY_TITLES[dept.cat].title}</h2>
            <span className="dept-count tabular">{deptItems.length} поз.</span>
          </div>
          <p className="dept-note">{CATEGORY_TITLES[dept.cat].note}</p>
          <div className="catalog-grid dept-grid">
            {deptItems.map((p) => (
              <ProductCard key={p.id} product={p} serverReservedPieceIds={serverReservedPieceIds} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Flag({ code }: { code: 'ru' | 'es' | 'it' | 'gr' | 'frch' }) {
  if (code === 'ru') {
    return (
      <svg className="flag-svg" viewBox="0 0 20 20" aria-hidden="true">
        <defs><clipPath id="f-ru"><circle cx="10" cy="10" r="9" /></clipPath></defs>
        <g clipPath="url(#f-ru)"><rect width="20" height="7" fill="#F6F5F0" /><rect y="7" width="20" height="6" fill="#0039A6" /><rect y="13" width="20" height="7" fill="#D52B1E" /></g>
        <circle cx="10" cy="10" r="9" fill="none" stroke="var(--bone-line)" strokeWidth="1" />
      </svg>
    );
  }
  if (code === 'es') {
    return (
      <svg className="flag-svg" viewBox="0 0 20 20" aria-hidden="true">
        <defs><clipPath id="f-es"><circle cx="10" cy="10" r="9" /></clipPath></defs>
        <g clipPath="url(#f-es)"><rect width="20" height="20" fill="#C60B1E" /><rect y="5" width="20" height="10" fill="#FFC400" /></g>
        <circle cx="10" cy="10" r="9" fill="none" stroke="var(--bone-line)" strokeWidth="1" />
      </svg>
    );
  }
  if (code === 'it') {
    return (
      <svg className="flag-svg" viewBox="0 0 20 20" aria-hidden="true">
        <defs><clipPath id="f-it"><circle cx="10" cy="10" r="9" /></clipPath></defs>
        <g clipPath="url(#f-it)"><rect width="7" height="20" fill="#009246" /><rect x="7" width="6" height="20" fill="#F6F5F0" /><rect x="13" width="7" height="20" fill="#CE2B37" /></g>
        <circle cx="10" cy="10" r="9" fill="none" stroke="var(--bone-line)" strokeWidth="1" />
      </svg>
    );
  }
  if (code === 'gr') {
    return (
      <svg className="flag-svg" viewBox="0 0 20 20" aria-hidden="true">
        <defs><clipPath id="f-gr"><circle cx="10" cy="10" r="9" /></clipPath></defs>
        <g clipPath="url(#f-gr)">
          <rect width="20" height="20" fill="#0D5EAF" />
          <rect y="3" width="20" height="2.4" fill="#F6F5F0" /><rect y="8" width="20" height="2.4" fill="#F6F5F0" /><rect y="13" width="20" height="2.4" fill="#F6F5F0" />
          <rect x="3" width="6" height="6.5" fill="#0D5EAF" /><rect x="5.3" width="1.6" height="6.5" fill="#F6F5F0" /><rect x="3" y="2.4" width="6" height="1.6" fill="#F6F5F0" />
        </g>
        <circle cx="10" cy="10" r="9" fill="none" stroke="var(--bone-line)" strokeWidth="1" />
      </svg>
    );
  }
  return (
    <svg className="flag-svg" viewBox="0 0 20 20" aria-hidden="true">
      <defs><clipPath id="f-frch"><circle cx="10" cy="10" r="9" /></clipPath></defs>
      <g clipPath="url(#f-frch)"><rect width="20" height="20" fill="#EF3340" /><rect x="7" y="7" width="6" height="6" fill="#F6F5F0" /></g>
      <circle cx="10" cy="10" r="9" fill="none" stroke="var(--bone-line)" strokeWidth="1" />
    </svg>
  );
}
