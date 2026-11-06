'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { STORY_ART } from './Art';
import { formatRub } from './CartContext';

// Истории лавки: лента с авто-прогрессом, пауза по удержанию, стрелки клавиатуры,
// заказ прямо из сторис. Цены берутся живьём из переданного каталога.

export interface StoryPiece {
  productId: string;
  pieceId1c: string;
  weightG: number;
  price: number;
}

interface Props {
  piece?: StoryPiece | null;
  onPieceAdd?: () => void;
  onSetAdd?: (setId: string) => void;
}

const STORIES = [
  { id: 'cut', label: 'Свежий распил', title: 'Кусок только что взвесили',
    text: 'Хамон «16», взвешен при приёмке. Цена по фактическому весу - до рубля.', action: 'piece' as const },
  { id: 'evening', label: 'Вкусный вечер', title: 'Набор к столу одним кликом',
    text: 'Нарезка «22», крупные Gordal и гриссини. Добавим весь набор в корзину сразу.', action: 'set' as const, setId: 'evening' },
  { id: 'weigh', label: 'Как вешаем', title: 'Почему цена до рубля',
    text: 'Каждый кусок взвешиваем при приёмке. Выбираете конкретный кусок - сумма видна сразу.', action: 'scroll' as const, target: 'weight-system' },
  { id: 'aging', label: 'Выдержка', title: 'От Bodega до Gran Reserva',
    text: '8-12 месяцев - мягкий вкус. 24-28+ - тёмный срез с кристаллами тирозина.', action: 'scroll' as const, target: 'aging' },
  { id: 'shop', label: 'Лавка на Сытном', title: 'Как нас найти',
    text: 'Сытнинская улица, 4П, фуд-аллея рынка «Сытный». Вторник-воскресенье, 10:30-20:30.',
    action: 'external' as const, href: 'https://yandex.ru/maps/-/CXq~AInl' },
];

const DURATION = 5000;

export default function Stories({ piece, onPieceAdd, onSetAdd }: Props) {
  const [current, setCurrent] = useState(0);
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTick = useRef<number>(0);

  useEffect(() => {
    document.body.dataset.storyPaused = paused ? '1' : '0';
    return () => { delete document.body.dataset.storyPaused; };
  }, [paused]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const start = useCallback(() => {
    stop();
    setElapsed(0);
    setPaused(false);
    lastTick.current = Date.now();
    timerRef.current = setInterval(() => {
      if (document.body.dataset.storyPaused === '1') { lastTick.current = Date.now(); return; }
      const now = Date.now();
      const delta = now - lastTick.current;
      lastTick.current = now;
      setElapsed((prev) => {
        const next = prev + delta;
        if (next >= DURATION) {
          setCurrent((c) => (c + 1) % STORIES.length);
          return 0;
        }
        return next;
      });
    }, 100);
  }, [stop]);

  useEffect(() => {
    if (!open) { stop(); return; }
    start();
    return stop;
  }, [open, current, start, stop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowRight') { setCurrent((c) => (c + 1) % STORIES.length); }
      if (e.key === 'ArrowLeft') { setCurrent((c) => (c - 1 + STORIES.length) % STORIES.length); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function openAt(idx: number) {
    setCurrent(idx);
    setSeen((prev) => new Set(prev).add(idx));
    setOpen(true);
  }

  const story = STORIES[current];

  return (
    <>
      <section className="stories-section container" aria-label="Истории лавки">
        <div className="stories-strip">
          {STORIES.map((s, idx) => (
            <button key={s.id} type="button" className="story-bubble" aria-label={`История: ${s.label}`} onClick={() => openAt(idx)}>
              <span className={'story-ring' + (seen.has(idx) ? ' is-seen' : '')}>
                <span className="story-art">{STORY_ART[s.id]}</span>
              </span>
              <span className="story-label">{s.label}</span>
            </button>
          ))}
        </div>
      </section>

      <div
        className={'stories-player' + (open ? ' is-open' : '')}
        role="dialog"
        aria-modal="true"
        aria-label="Просмотр истории"
        aria-hidden={!open}
        onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('button,a')) setPaused(true); }}
        onPointerUp={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      >
        <div className="stories-frame">
          <div className="story-bars">
            {STORIES.map((_, i) => (
              <span key={i} aria-hidden="true">
                <i style={{ transform: `scaleX(${i < current ? 1 : i === current ? elapsed / DURATION : 0})` }} />
              </span>
            ))}
          </div>
          <div className="story-head">
            <div className="story-head-title">{story.title}</div>
            <button type="button" className="story-close" aria-label="Закрыть истории" onClick={() => setOpen(false)}>Закрыть</button>
          </div>
          <div className="story-visual" aria-hidden="true">{STORY_ART[story.id]}</div>
          <p className="story-text">{story.text}</p>
          <div className="story-nav-row">
            <button type="button" className="story-step-btn" onClick={() => setCurrent((c) => (c - 1 + STORIES.length) % STORIES.length)}>Предыдущая</button>
            <button type="button" className="story-step-btn" onClick={() => setCurrent((c) => (c + 1) % STORIES.length)}>Следующая</button>
          </div>
          <StoryAction story={story} piece={piece} onPieceAdd={onPieceAdd} onSetAdd={onSetAdd} onClose={() => setOpen(false)} />
        </div>
      </div>
    </>
  );
}

function StoryAction({ story, piece, onPieceAdd, onSetAdd, onClose }: {
  story: (typeof STORIES)[number];
  piece: StoryPiece | null | undefined;
  onPieceAdd?: () => void;
  onSetAdd?: (setId: string) => void;
  onClose: () => void;
}) {
  if (story.action === 'piece') {
    if (!piece) {
      return <button type="button" className="story-action-btn" disabled>Куски уже разобрали</button>;
    }
    return (
      <button
        type="button"
        className="story-action-btn tabular"
        onClick={() => { onPieceAdd?.(); onClose(); }}
      >
        Забрать кусок {piece.weightG}{'\u00A0'}г за {formatRub(piece.price)}
      </button>
    );
  }
  if (story.action === 'set') {
    return (
      <button type="button" className="story-action-btn" onClick={() => { onSetAdd?.(story.setId!); onClose(); }}>
        Добавить весь набор
      </button>
    );
  }
  if (story.action === 'scroll') {
    return (
      <button
        type="button"
        className="story-action-btn"
        onClick={() => {
          onClose();
          document.getElementById(story.target!)?.scrollIntoView({ behavior: 'smooth' });
        }}
      >
        {story.target === 'weight-system' ? 'Посчитать на весах' : 'Открыть гид по выдержке'}
      </button>
    );
  }
  return (
    <a className="story-action-btn" href={story.href} target="_blank" rel="noopener">
      Построить маршрут
    </a>
  );
}
