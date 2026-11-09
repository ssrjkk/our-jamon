'use client';

import { useEffect, useId, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Product } from '@/lib/types';
import { CATEGORY_TITLES, DEPT_ORDER, PREVIEWS, type CatalogPreview } from '@/lib/products';
import ProductCard from './ProductCard';
import { ProductArt } from './Art';

const AGING = [{ value: '8-12', label: '8–12 мес.' }, { value: '14-18', label: '14–18 мес.' }, { value: '20-22', label: '20–22 мес.' }, { value: '24', label: '24+ мес.' }];
function ageMatches(months: number | null, value: string) {
  if (!value || value === 'all') return true;
  if (!months) return false;
  if (value === '24' || value === '24+') return months >= 24;
  if (/^\d+-\d+$/.test(value)) {
    const [min, max] = value.split('-').map(Number);
    return months >= min && months <= max;
  }
  return months === Number(value);
}
function normalize(value: string) { return value.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim(); }

export default function CatalogClient({ products, serverReservedPieceIds, standalone = false }: { products: Product[]; serverReservedPieceIds: string[]; standalone?: boolean }) {
  const params = useSearchParams();
  const controlId = useId();
  const departmentsRef = useRef<HTMLDivElement>(null);
  const q = params.get('q') ?? params.get('query') ?? '';
  const aging = params.get('aging') ?? 'all';
  const requestedCategory = params.get('category') ?? params.get('cat') ?? '';
  const Heading = standalone ? 'h1' : 'h2';
  const DeptHeading = standalone ? 'h2' : 'h3';
  const PreviewHeading = standalone ? 'h3' : 'h4';
  const words = useMemo(() => normalize(q).split(/\s+/).filter(Boolean), [q]);

  function update(values: Record<string, string>, replace = false) {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('category') && url.searchParams.has('cat')) url.searchParams.set('category', url.searchParams.get('cat')!);
    if (!url.searchParams.has('q') && url.searchParams.has('query')) url.searchParams.set('q', url.searchParams.get('query')!);
    url.searchParams.delete('cat');
    url.searchParams.delete('query');
    for (const [key, value] of Object.entries(values)) {
      if (!value || value === 'all') url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    if ('category' in values && url.hash.startsWith('#dept-')) url.hash = url.pathname === '/' ? 'catalog' : values.category ? `dept-${values.category}` : '';
    window.history[replace ? 'replaceState' : 'pushState'](null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  useEffect(() => {
    const syncDepartment = () => {
      const department = DEPT_ORDER.find((item) => `#${item.id}` === window.location.hash);
      if (department) {
        const url = new URL(window.location.href);
        url.searchParams.set('category', department.cat);
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      }
    };
    syncDepartment();
    window.addEventListener('hashchange', syncDepartment);
    return () => window.removeEventListener('hashchange', syncDepartment);
  }, []);

  const searched = useMemo(() => products.filter((product) => {
    const haystack = normalize(`${product.title} ${product.description} ${CATEGORY_TITLES[product.category].title} ${product.agingMonths ?? ''}`);
    return words.every((word) => haystack.includes(word));
  }), [products, words]);
  const matches = searched.filter((product) => ageMatches(product.agingMonths, aging));
  const searchedPreviews = useMemo(() => PREVIEWS.filter((preview) => {
    const haystack = normalize(`${preview.title} ${preview.description} ${CATEGORY_TITLES[preview.category].title} ${preview.agingMonths ?? ''}`);
    return words.every((word) => haystack.includes(word));
  }), [words]);
  const previewMatches = searchedPreviews.filter((preview) => ageMatches(preview.agingMonths, aging));
  const countFor = (cat: string) => matches.filter((product) => product.category === cat).length + previewMatches.filter((preview) => preview.category === cat).length;
  const departments = DEPT_ORDER.filter((department) => products.some((product) => product.category === department.cat) || PREVIEWS.some((preview) => preview.category === department.cat));
  const firstMatch = departments.find((department) => countFor(department.cat) > 0);
  const requested = departments.find((department) => department.cat === requestedCategory);
  const category = (requested && (!q || countFor(requested.cat) > 0) ? requested : firstMatch ?? requested ?? departments[0])?.cat ?? 'piece';
  const items = matches.filter((product) => product.category === category);
  const currentPreviews = previewMatches.filter((preview) => preview.category === category);
  const applicable = searched.filter((product) => product.category === category);
  const applicablePreviews = searchedPreviews.filter((preview) => preview.category === category);
  const ageOptions = AGING.filter((option) => [...applicable, ...applicablePreviews].some((entry) => ageMatches(entry.agingMonths, option.value)));
  const filtered = Boolean(q || aging !== 'all');
  function reset() { update({ q: '', aging: '', category: '' }); }

  useEffect(() => {
    let mounted = true;
    const align = () => {
      const bar = departmentsRef.current;
      const active = bar?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!bar || !active) return;
      const parent = bar.getBoundingClientRect();
      const button = active.getBoundingClientRect();
      if (button.left < parent.left) bar.scrollLeft += button.left - parent.left;
      else if (button.right > parent.right) bar.scrollLeft += button.right - parent.right;
    };
    align();
    void document.fonts.ready.then(() => { if (mounted) align(); });
    window.addEventListener('resize', align);
    return () => { mounted = false; window.removeEventListener('resize', align); };
  }, [category, q, aging]);

  return (
    <section className={'container catalog-section' + (standalone ? ' standalone' : '')} aria-labelledby={`${controlId}-title`}>
      <div className="catalog-heading">
        <div><Heading className="section-title" id={`${controlId}-title`}>Выбирайте со вкусом</Heading><p className="section-subtitle">Хамон и его хорошая компания. Вся лавка — в одном каталоге.</p></div>
        <span className="catalog-stock tabular">С ценой: {products.length} · Уточняются: {PREVIEWS.length}</span>
      </div>
      <div className="catalog-controls">
        <div className="catalog-search">
          <label className="sr-only" htmlFor={`${controlId}-search`}>Поиск по всей лавке</label>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="m15 15 5 5" stroke="currentColor" strokeWidth="1.5" /></svg>
          <input id={`${controlId}-search`} type="search" value={q} placeholder="Найти хамон, сыр, оливки…" onChange={(event) => update({ q: event.target.value, aging: '' }, true)} />
          {q && <button type="button" className="search-clear" aria-label="Очистить поиск" onClick={() => update({ q: '' }, true)}>×</button>}
        </div>
        <div className="catalog-filters">
          {(ageOptions.length > 1 || aging !== 'all') && <label className="compact-filter">Выдержка<select value={aging} onChange={(event) => update({ aging: event.target.value })}><option value="all">Любая</option>{ageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}{aging !== 'all' && !ageOptions.some((option) => option.value === aging) && <option value={aging}>{aging} мес.</option>}</select></label>}
          {filtered && <button className="filter-reset" type="button" onClick={reset}>Сбросить всё</button>}
        </div>
      </div>
      <div ref={departmentsRef} className="dept-tabs" role="group" aria-label="Категории каталога">
        {departments.map((department) => {
          const count = countFor(department.cat);
          return <button key={department.cat} type="button" aria-pressed={category === department.cat} disabled={Boolean(q) && !count}
            onClick={() => update({ category: department.cat, aging: '' })}>{CATEGORY_TITLES[department.cat].title}<span className="dept-count">{count}</span></button>;
        })}
      </div>
      {q && <p className="catalog-hint" role="status">По всей лавке найдено: {matches.length + previewMatches.length}. {items.length + currentPreviews.length > 0 ? `Показана категория «${CATEGORY_TITLES[category].title}». Другие совпадения — в категориях выше.` : 'Попробуйте другое название или сбросьте фильтры.'}</p>}
      {items.length + currentPreviews.length ? <div className="dept-section" id={`dept-${category}`}>
        <div className="dept-head"><DeptHeading className="dept-title">{CATEGORY_TITLES[category].title}</DeptHeading><span className="dept-count tabular">{items.length + currentPreviews.length} позиций</span></div>
        <p className="dept-note">{CATEGORY_TITLES[category].note}</p>
        <div className="catalog-grid">
          {items.map((product) => <ProductCard key={product.id} product={product} serverReservedPieceIds={serverReservedPieceIds} headingLevel={standalone ? 'h3' : 'h4'} />)}
          {currentPreviews.map((preview) => <PreviewCard key={preview.id} preview={preview} Heading={PreviewHeading} />)}
        </div>
      </div> : <div className="cart-empty-state" role="status"><h3>{products.length ? 'Не нашлось подходящих товаров' : 'Каталог обновляется'}</h3><p>{products.length ? 'Измените поиск, выберите другую категорию или уберите фильтры.' : 'Уточните наличие в лавке по телефону +7 (906) 896-00-99.'}</p>{products.length > 0 && <button type="button" className="btn-primary" onClick={reset}>Показать каталог без фильтров</button>}</div>}
    </section>
  );
}

function PreviewCard({ preview, Heading }: { preview: CatalogPreview; Heading: 'h3' | 'h4' }) {
  return (
    <article className="product-card" data-preview-id={preview.id}>
      <div className="product-card-intro">
        <div className="card-media"><ProductArt product={preview} /></div>
        <div className="card-header-row"><Heading className="card-title">{preview.title}</Heading></div>
        <div className="card-meta">{preview.agingMonths ? `${preview.agingMonths} мес. выдержки` : CATEGORY_TITLES[preview.category].short}</div>
        {preview.description && <p className="card-desc">{preview.description}</p>}
      </div>
      <div className="selector-dynamic-slot">
        <p className="custom-cut-note">Позиция есть в прайсе поставщика, но цена и наличие подтверждаются перед заказом.</p>
        <div className="card-footer"><div className="price-stack"><span className="price-label">Цена уточняется</span><strong className="price-value">—</strong></div><a className="add-btn" href="tel:+79068960099">Уточнить в лавке</a></div>
      </div>
    </article>
  );
}
