'use client';

import { useEffect } from 'react';

// =========================================================================
// Слой движения. Прячет то, что ещё не попало в кадр, только когда JS успел
// пометить корень атрибутом data-motion="on": без JavaScript и в профиле
// «меньше движения» правила не применяются, и весь текст виден с первой отрисовки.
// Показ по прямоугольнику, а не IntersectionObserver: панели переключаются
// атрибутом hidden, и наблюдателю пришлось бы угадывать, какая из семи открыта.
// =========================================================================

const REDUCED = '(prefers-reduced-motion: reduce)';
const EDGE = 0.92;
const MAX_STAGGER = 7;

/** Короткая посадка контрола: класс снимается сам, поэтому повторный клик не накапливает анимацию. */
export function popElement(node: HTMLElement | null, className = 'is-pop') {
  if (!node || window.matchMedia(REDUCED).matches) return;
  node.classList.remove(className);
  // Перезапуск требует кадра без класса: без обращения к раскладке браузер считает, что ничего не изменилось.
  void node.offsetWidth;
  node.classList.add(className);
  node.addEventListener('animationend', () => node.classList.remove(className), { once: true });
}

export default function MotionLayer() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia(REDUCED);
    const header = document.querySelector<HTMLElement>('.site-header');

    function paint() {
      root.dataset.motion = reduce.matches ? 'reduced' : 'on';
      if (reduce.matches) return;
      let step = 0;
      // Ступень лесенки считается на блок, а не на размеченный узел: у карточки каталога
      // показан и контейнер (подъём), и её фотография (свой срез). Если бы вложенный узел
      // тратил отдельную ступень, ряд из шести карточек выстроил бы лесенку из двенадцати
      // ступеней, упёрся бы в предел MAX_STAGGER и показал половину ряда одним кадром —
      // ровно то, из-за чего лесенка теряет смысл. Вложенный показ едет ступенью родителя,
      // но только когда родитель размечается в этом же кадре: узел, который React дособрал
      // позже, не должен получать задержку от уже отыгранной блоки.
      const ступени = new Map<Element, string>();
      for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))) {
        // Состояние показа живёт в инлайновых кастомных свойствах, а не в классе: слой
        // успевает пройтись по узлам до того, как React догидратирует отложенную границу
        // (панель каталога на главной). Любой чужой атрибут на негидратированном узле
        // React 19 считает расхождением server/client — поэтому узлы с data-reveal
        // помечены revealProps и их атрибуты не сверяются. Правила анимации остаются в CSS.
        if (node.style.getPropertyValue('--reveal-name')) continue;
        // Скрытая панель: показывать нечего, а счётчик задержки занят бы был впустую.
        if (!node.offsetParent) continue;
        const box = node.getBoundingClientRect();
        // Ниже сгиба — дождётся прокрутки. Выше сгиба — уже пролетели мимо (панель
        // открыли, когда страница стояла внизу, либо браузер восстановил скролл
        // назад): такой узел показывается сразу и без лесенки, иначе он остался бы
        // невидимым навсегда.
        if (box.top >= window.innerHeight * EDGE) continue;
        const пролетели = box.bottom <= 0;
        const общая = node.parentElement?.closest('[data-reveal]');
        const унаследованная = общая ? ступени.get(общая) : undefined;
        let задержка = '0';
        if (!пролетели) {
          if (унаследованная === undefined) {
            задержка = String(Math.min(step, MAX_STAGGER));
            step += 1;
          } else {
            задержка = унаследованная;
          }
        }
        node.style.setProperty('--reveal-i', задержка);
        // Вариант появления берётся из разметки (revealInto), слой только навешивает префикс:
        // чем именно показывать узел — решение страницы, а что делает этот кадр — решение CSS.
        node.style.setProperty('--reveal-name', `nh-${node.dataset.revealInto || 'rise'}`);
        ступени.set(node, задержка);
      }
    }

    function progress() {
      const scrollable = root.scrollHeight - window.innerHeight;
      root.style.setProperty('--scroll', scrollable > 0 ? String(Math.min(1, window.scrollY / scrollable)) : '0');
      header?.toggleAttribute('data-scrolled', window.scrollY > 8);
      // Смещение первого экрана считается в пикселях и ограничивается одним экраном: ниже
      // сгиба героя уже нет, а множители и предел (--parallax-*) остаются в CSS. Значение
      // округлено до пикселя, чтобы слой не переписывал свойство каждым дробным кадром.
      root.style.setProperty('--hero-shift', `${Math.round(Math.min(window.scrollY, window.innerHeight))}px`);
    }

    let frame = 0;
    const sync = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint();
        progress();
      });
    };
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    window.addEventListener('nh-panel-change', sync);
    reduce.addEventListener('change', sync);
    // Сетка каталога пересобирается на каждый ввод: новые строки тоже помечены data-reveal,
    // и без повторного скана они оставались бы скрытыми до первой прокрутки.
    const changes = new MutationObserver(sync);
    changes.observe(document.getElementById('main-content') ?? document.body, { childList: true, subtree: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      changes.disconnect();
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('nh-panel-change', sync);
      reduce.removeEventListener('change', sync);
    };
  }, []);

  return null;
}
