'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { STORY_ART } from './Art';
import { formatRub, formatWeightLabel } from './CartContext';
import { navigateToTab, type TabId } from './SiteTabs';
import { useDialogFocus } from './SiteHeader';

export interface StoryPiece { productId: string; title: string; weightG: number; price: number }
interface Props {
  piece?: StoryPiece | null;
  setAvailable?: boolean;
  setPrice?: number;
  onPieceAdd?: () => boolean;
  onSetAdd?: (setId: string) => boolean | string;
}
const STORIES = [
  { id: 'cut', label: 'Выбрать кусок', title: 'Небольшой кусок. Большой вкус.', text: 'Выберите средний кусок хамона. Точный вес и сумму подтвердим перед оплатой.' },
  { id: 'evening', label: 'К столу', title: 'Вкусный вечер', text: 'Нарезка «22», оливки Gordal и гриссини. Весь состав и цены — из актуального каталога.' },
  { id: 'weigh', label: 'Честный вес', title: 'Вес меняется. Правило — нет.', text: 'Сумма весового товара зависит от фактического веса. На весах можно рассчитать желаемую порцию заранее.' },
  { id: 'aging', label: 'Выдержка', title: 'Вкусу нужно время', text: 'С выдержкой вкус становится глубже, а текстура — плотнее. Откройте гид и выберите характер хамона.' },
  { id: 'shop', label: 'Наша лавка', title: 'Встретимся на Сытном', text: 'Сытнинская, 4П, фуд-аллея рынка «Сытный». Вторник–воскресенье, 10:30–20:30.' },
];
const DURATION = 7000;

export default function Stories({ piece, setAvailable = false, setPrice, onPieceAdd, onSetAdd }: Props) {
  const [current, setCurrent] = useState(0);
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); setHolding(false); }, []);
  useDialogFocus(open, dialogRef, close);
  const step = useCallback((direction: number) => {
    setCurrent((index) => (index + direction + STORIES.length) % STORIES.length);
    setElapsed(0);
    setFeedback('');
  }, []);

  useEffect(() => {
    const visibility = () => setPageHidden(document.hidden);
    const release = () => setHolding(false);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    setSeen((previous) => new Set(previous).add(current));
  }, [open, current]);
  useEffect(() => {
    if (!open || paused || holding || pageHidden) return;
    let last = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const delta = now - last;
      last = now;
      setElapsed((previous) => previous + delta);
    }, 100);
    return () => window.clearInterval(timer);
  }, [open, paused, holding, pageHidden, current]);
  useEffect(() => {
    if (!open || paused || holding || pageHidden || elapsed < DURATION) return;
    if (current === STORIES.length - 1) close();
    else step(1);
  }, [elapsed, current, open, paused, holding, pageHidden, close, step]);
  useEffect(() => {
    if (!open) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); }
      if (event.code === 'Space' && !(event.target as HTMLElement).closest('button,a,input')) { event.preventDefault(); setPaused((value) => !value); }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [open, step]);

  function openAt(index: number) {
    setCurrent(index); setElapsed(0); setPaused(false); setFeedback(''); setOpen(true);
  }
  function go(id: TabId) {
    close();
    window.setTimeout(() => {
      navigateToTab(id);
      document.getElementById(`tab-${id}`)?.focus({ preventScroll: true });
    }, 0);
  }
  function add(action: 'piece' | 'set') {
    const result = action === 'piece' ? onPieceAdd?.() : onSetAdd?.('evening');
    setPaused(true);
    setFeedback(result === true ? action === 'piece' ? 'Кусок добавлен в корзину.' : 'Весь набор добавлен в корзину.' : typeof result === 'string' ? result : 'Достигнуто максимальное количество. Проверьте корзину.');
  }
  const story = STORIES[current];
  const hasSet = setAvailable && typeof setPrice === 'number' && Number.isFinite(setPrice) && setPrice > 0;

  return <>
    <section className="container stories-section" aria-label="Истории лавки">
      <span className="stories-caption">Из жизни лавки</span>
      <div className="stories-strip">{STORIES.map((item, index) => <button type="button" key={item.id} className="story-bubble" aria-haspopup="dialog" aria-label={`Открыть историю: ${item.label}`} onClick={() => openAt(index)}><span className={'story-ring' + (seen.has(index) ? ' is-seen' : '')}><span className="story-art" aria-hidden="true">{STORY_ART[item.id]}</span></span><span className="story-label">{item.label}</span></button>)}</div>
    </section>
    <div className={'stories-player' + (open ? ' is-open' : '')} aria-hidden={!open} inert={!open} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="stories-frame" ref={dialogRef} role="dialog" aria-modal={open || undefined} aria-labelledby="story-title" tabIndex={-1}
        onPointerDown={(event) => { if (!(event.target as HTMLElement).closest('button,a,input')) setHolding(true); }}>
        <div className="story-bars" aria-hidden="true">{STORIES.map((_, index) => <span key={index}><i style={{ transform: `scaleX(${index < current ? 1 : index === current ? Math.min(1, elapsed / DURATION) : 0})` }} /></span>)}</div>
        <div className="story-head"><span className="story-position">История {current + 1} из {STORIES.length}</span><button type="button" className="story-close" onClick={close}>Закрыть</button></div>
        <div className="story-visual" aria-hidden="true">{STORY_ART[story.id]}</div>
        <h2 id="story-title" className="story-head-title">{story.title}</h2><p className="story-text">{story.text}</p>
        <div className="story-nav-row"><button className="story-step-btn" type="button" aria-label="Предыдущая история" onClick={() => step(-1)}>← Назад</button><button className="story-step-btn" type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? 'Продолжить' : 'Пауза'}</button><button className="story-step-btn" type="button" aria-label="Следующая история" onClick={() => step(1)}>Далее →</button></div>
        {story.id === 'cut' && <><p className="story-product">{piece ? `${piece.title} · ~${formatWeightLabel(piece.weightG)}` : 'Средние куски сейчас недоступны.'}</p><button type="button" className="story-action-btn" disabled={!piece || !onPieceAdd} onClick={() => add('piece')}>{piece ? `Добавить · ≈ ${formatRub(piece.price)}` : 'Нет в наличии'}</button></>}
        {story.id === 'evening' && <button type="button" className="story-action-btn" disabled={!hasSet || !onSetAdd} onClick={() => add('set')}>{hasSet ? `Весь набор · ${formatRub(setPrice!)}` : 'Полный набор недоступен'}</button>}
        {story.id === 'weigh' && <button type="button" className="story-action-btn" onClick={() => go('weight-system')}>Посчитать на весах</button>}
        {story.id === 'aging' && <button type="button" className="story-action-btn" onClick={() => go('aging')}>Открыть гид по выдержке</button>}
        {story.id === 'shop' && <a className="story-action-btn" href="https://yandex.ru/maps/-/CXq~AInl" target="_blank" rel="noopener noreferrer">Построить маршрут</a>}
        <p className="card-feedback" role="status">{feedback}</p>
      </div>
    </div>
  </>;
}
