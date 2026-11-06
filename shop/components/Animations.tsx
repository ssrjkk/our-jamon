'use client';

import { useEffect, useRef } from 'react';

// =========================================================================
// Фирменные анимации: свинка с окороком и полёт в корзину.
// Триггеры из любого клиентского компонента:
//   runPig()                  - свинка пробегает по нижней кромке (кулдаун 8 с)
//   flyTokenToCart(rect, 'olive' | 'ham')  - дуга в иконку корзины
// =========================================================================

let lastPigRun = 0;

export function runPig() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const now = Date.now();
  if (now - lastPigRun < 8000) return;
  lastPigRun = now;
  window.dispatchEvent(new CustomEvent('nh-pig-run'));
}

export function flyTokenToCart(startRect: DOMRect, tokenType: 'olive' | 'ham') {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  window.dispatchEvent(new CustomEvent('nh-fly-token', { detail: { rect: { left: startRect.left, top: startRect.top, width: startRect.width, height: startRect.height }, tokenType } }));
}

export default function AnimationsLayer() {
  const pigRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let gsap: typeof import('gsap')['gsap'] | null = null;
    import('gsap').then((mod) => { gsap = mod.gsap; });

    const onPigRun = () => {
      const layer = pigRef.current;
      if (!layer || !gsap) return;
      const g = gsap;
      const vw = window.innerWidth;
      const stopX = Math.min(vw * 0.68, vw - 180);
      g.killTweensOf(layer);
      g.set(layer, { x: -160, opacity: 1 });
      const body = layer.querySelector('#pig-body-group');
      const legs = layer.querySelectorAll('.pig-leg');
      const ear = layer.querySelector('#pig-ear');
      const tail = layer.querySelector('#pig-tail');
      const arm = layer.querySelector('#pig-front-arm');
      const ham = layer.querySelector('#pig-held-ham');

      const gait = g.timeline({ repeat: 9, yoyo: true });
      gait.fromTo(legs[0], { rotation: -25 }, { rotation: 25, duration: 0.14, ease: 'sine.inOut' }, 0)
        .fromTo(legs[1], { rotation: 25 }, { rotation: -25, duration: 0.14, ease: 'sine.inOut' }, 0)
        .fromTo(legs[2], { rotation: -25 }, { rotation: 25, duration: 0.14, ease: 'sine.inOut' }, 0)
        .fromTo(body, { y: 0 }, { y: -5, duration: 0.14, ease: 'sine.inOut' }, 0)
        .fromTo(ear, { rotation: -8 }, { rotation: 10, duration: 0.14, ease: 'sine.inOut' }, 0.03)
        .fromTo(tail, { rotation: -12 }, { rotation: 14, duration: 0.14, ease: 'sine.inOut' }, 0.04)
        .fromTo(arm, { rotation: -6 }, { rotation: 8, duration: 0.14, ease: 'sine.inOut' }, 0.02);

      const main = g.timeline();
      main.to(layer, {
        x: stopX, duration: 1.85, ease: 'power1.out',
        onComplete: () => {
          if (ham) {
            const rect = ham.getBoundingClientRect();
            g.set(ham, { opacity: 0 });
            flyTokenToCart(rect, 'ham');
          }
        },
      }).to(layer, {
        x: vw + 180, duration: 0.85, ease: 'power1.in',
        onComplete: () => { g.set(layer, { opacity: 0 }); },
      });
    };

    const onFly = (e: Event) => {
      if (!gsap) return;
      const g = gsap;
      const detail = (e as CustomEvent).detail as { rect: { left: number; top: number; width: number; height: number }; tokenType: 'olive' | 'ham' };
      const cartBtn = document.querySelector<HTMLAnchorElement>('[data-cart-trigger]');
      const badge = document.querySelector<HTMLElement>('[data-cart-badge]');
      if (!cartBtn) return;
      const target = cartBtn.getBoundingClientRect();
      const token = document.createElement('div');
      token.className = 'flying-token';
      token.innerHTML = detail.tokenType === 'olive'
        ? '<svg viewBox="0 0 28 28" width="26" height="26"><ellipse cx="14" cy="14" rx="11" ry="9.5" fill="#4E5E32" stroke="#181615" stroke-width="1.2"/><ellipse cx="18" cy="13" rx="3.2" ry="4.2" fill="#7A1C1C"/></svg>'
        : '<svg viewBox="0 0 36 36" width="30" height="30"><path d="M10 10 C20 4, 32 10, 29 22 C26 30, 16 31, 11 26 Z" fill="#7A1C1C"/><path d="M14 15 C19 12, 24 14, 26 19" stroke="#F6F5F0" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
      document.body.appendChild(token);

      const startX = detail.rect.left + detail.rect.width / 2 - 14;
      const startY = detail.rect.top + detail.rect.height / 2 - 14;
      const endX = target.left + target.width / 2 - 14;
      const endY = target.top + target.height / 2 - 14;
      g.set(token, { x: startX, y: startY });
      const proxy = { t: 0 };
      const peakY = Math.min(startY, endY) - 90;
      g.to(proxy, {
        t: 1, duration: 0.58, ease: 'power2.inOut',
        onUpdate: () => {
          const p = proxy.t;
          const curX = startX + (endX - startX) * p;
          const curY = (1 - p) * (1 - p) * startY + 2 * (1 - p) * p * peakY + p * p * endY;
          g.set(token, { x: curX, y: curY, rotation: p * 180, scale: 1 - p * 0.25 });
        },
        onComplete: () => {
          token.remove();
          if (badge) {
            g.fromTo(badge, { scale: 1.35 }, { scale: 1, duration: 0.28, ease: 'back.out(2)' });
          }
        },
      });
    };

    window.addEventListener('nh-pig-run', onPigRun);
    window.addEventListener('nh-fly-token', onFly);
    return () => {
      window.removeEventListener('nh-pig-run', onPigRun);
      window.removeEventListener('nh-fly-token', onFly);
    };
  }, []);

  return (
    <div ref={pigRef} className="pig-runner-layer" aria-hidden="true">
      <svg viewBox="0 0 160 105" width="140" height="92" fill="none">
        <g id="pig-body-group">
          <g id="pig-tail" style={{ transformOrigin: '24px 54px' }}>
            <path d="M24 54 C12 48, 12 38, 20 40" stroke="#181615" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="pig-leg" style={{ transformOrigin: '42px 68px' }}>
            <rect x="39" y="66" width="6" height="22" rx="3" fill="#181615" />
          </g>
          <g className="pig-leg" style={{ transformOrigin: '54px 68px' }}>
            <rect x="51" y="66" width="6" height="22" rx="3" fill="#7A1C1C" />
          </g>
          <g className="pig-leg" style={{ transformOrigin: '86px 68px' }}>
            <rect x="83" y="66" width="6" height="22" rx="3" fill="#181615" />
          </g>
          <rect x="24" y="38" width="76" height="34" rx="17" fill="#181615" />
          <g id="pig-head">
            <rect x="84" y="28" width="34" height="28" rx="12" fill="#181615" />
            <rect x="112" y="36" width="10" height="14" rx="4" fill="#7A1C1C" />
            <circle cx="104" cy="38" r="2.2" fill="#F6F5F0" />
          </g>
          <g id="pig-ear" style={{ transformOrigin: '94px 30px' }}>
            <path d="M88 30 L96 17 L103 29 Z" fill="#7A1C1C" />
          </g>
          <g id="pig-front-arm" style={{ transformOrigin: '96px 56px' }}>
            <rect x="94" y="52" width="24" height="6" rx="3" fill="#181615" />
            <g id="pig-held-ham">
              <path d="M114 30 C126 22, 142 30, 138 44 C135 53, 124 56, 117 50 L110 58 L106 54 L113 46 Z" fill="#7A1C1C" />
              <path d="M122 35 Q129 38 131 44" stroke="#F6F5F0" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

// Прыгающие оливки внутри карточки
export function bounceOlives(stage: HTMLElement | null) {
  if (!stage || typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  import('gsap').then(({ gsap }) => {
    const rect = stage.getBoundingClientRect();
    const floorY = rect.height - 28;
    for (let i = 0; i < 4; i++) {
      const olive = document.createElement('div');
      olive.style.cssText = 'position:absolute;width:26px;height:26px;left:0;top:0;';
      olive.innerHTML = '<svg viewBox="0 0 28 28" width="26" height="26" fill="none"><ellipse cx="14" cy="14" rx="11" ry="9.5" fill="#4E5E32" stroke="#181615" stroke-width="1.2"/><ellipse cx="18" cy="13" rx="3.2" ry="4.2" fill="#7A1C1C"/><path d="M8 10 Q11 7 15 8" stroke="#F6F5F0" stroke-width="1.4" stroke-linecap="round" opacity="0.75" fill="none"/></svg>';
      stage.appendChild(olive);
      const startX = 28 + i * ((rect.width - 70) / 3);
      const angle = (i % 2 === 0 ? 1 : -1) * (12 + i * 5);
      gsap.set(olive, { x: startX, y: -28, rotation: -angle });
      const tl = gsap.timeline({ delay: i * 0.075, onComplete: () => olive.remove() });
      tl.to(olive, { y: floorY, scaleY: 1.1, scaleX: 0.92, rotation: 0, duration: 0.24, ease: 'power2.in' })
        .to(olive, { scaleY: 0.8, scaleX: 1.15, duration: 0.06 })
        .to(olive, { y: floorY - 56, scaleY: 1.06, scaleX: 0.95, rotation: angle, duration: 0.2, ease: 'power2.out' })
        .to(olive, { y: floorY, scaleY: 1.08, scaleX: 0.94, duration: 0.2, ease: 'power2.in' })
        .to(olive, { scaleY: 0.84, scaleX: 1.12, duration: 0.05 })
        .to(olive, { y: floorY - 24, scaleY: 1.02, scaleX: 0.98, rotation: -angle * 0.5, duration: 0.14, ease: 'power2.out' })
        .to(olive, { y: floorY, scaleY: 1, scaleX: 1, rotation: 0, duration: 0.14, ease: 'power2.in' })
        .to(olive, { opacity: 0, duration: 0.15, delay: 0.05 });
    }
  });
}
