import Link from 'next/link';

// Лёгкий первый экран: фирменный логотип, одна мысль, две кнопки, три факта.
// Старт цепляет фоном и дизайном за 2 секунды (задача Виталия).
// ЗАМЕНИТЬ: фоном можно поставить реальное макро-фото нарезки от @nashhamon.spb
export default function HeroLight() {
  return (
    <section className="hero-light">
      <div className="container hero-light-grid">
        <div className="hero-copy">
          <p className="hero-kicker">Лавка деликатесов · Сытный рынок</p>
          <h1 className="hero-big">
            Хамон — главный герой.
            <br />
            Вкусы <em>вокруг</em> него
          </h1>
          <p className="hero-sub">
            Нарезка, куски и целые ноги. Взвешиваем при приёмке — цена до рубля.
          </p>
          <div className="hero-cta-row">
            <a href="#scenarios" className="btn-primary">Выбрать сценарий</a>
            <Link href="/catalog" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              Вся витрина
            </Link>
          </div>
          <div className="hero-chips">
            <span className="hero-chip tabular">Выдержка 8–28+ мес</span>
            <span className="hero-chip">Сытнинская, 4П · вт–вс 10:30–20:30</span>
            <span className="hero-chip">Доставка по СПб день в день</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <HeroSliceArt />
        </div>
      </div>
    </section>
  );
}

// Большая векторная композиция «веер нарезки» на кремовом фоне.
// ЗАМЕНИТЬ: макро-фото среза хамона (горизонт, ~1200×900).
function HeroSliceArt() {
  return (
    <svg viewBox="0 0 760 560" role="img" aria-label="Веер тонких ломтиков хамона">
      <rect width="760" height="560" fill="#F4EDDE" />
      <ellipse cx="380" cy="470" rx="300" ry="34" fill="#EDE3CC" />
      {/* Веер ломтиков */}
      <g transform="translate(380 430)">
        <path d="M0 0 L-190 -70 Q-210 -80 -196 -94 L0 -30 Z" fill="#8E2A24" />
        <path d="M-186 -76 L-40 -42" stroke="#F6EFE2" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M0 0 L-150 -120 Q-166 -134 -146 -142 L0 -34 Z" fill="#9E332B" />
        <path d="M-146 -126 L-20 -44" stroke="#F6EFE2" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M0 0 L-90 -160 Q-80 -178 -58 -168 L0 -38 Z" fill="#B9524A" />
        <path d="M-84 -152 L-14 -46" stroke="#F6EFE2" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <path d="M0 0 L-20 -188 Q-8 -204 12 -192 L0 -40 Z" fill="#C96A5F" />
        <path d="M-14 -178 L-4 -48" stroke="#F6EFE2" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <path d="M0 0 L60 -176 Q84 -184 88 -164 L0 -42 Z" fill="#9E332B" />
        <path d="M56 -166 L0 -46" stroke="#F6EFE2" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M0 0 L140 -140 Q160 -142 156 -122 L0 -44 Z" fill="#8E2A24" />
        <path d="M132 -134 L0 -46" stroke="#F6EFE2" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M0 0 L200 -80 Q218 -72 206 -56 L0 -46 Z" fill="#B9524A" />
        <path d="M190 -76 L0 -48" stroke="#F6EFE2" strokeWidth="4" fill="none" strokeLinecap="round" />
        {/* Кристаллы тирозина */}
        <circle cx="-70" cy="-96" r="3" fill="#F6EFE2" opacity="0.9" />
        <circle cx="30" cy="-130" r="2.6" fill="#F6EFE2" opacity="0.9" />
        <circle cx="110" cy="-90" r="2.4" fill="#F6EFE2" opacity="0.85" />
        <circle cx="-120" cy="-52" r="2.2" fill="#F6EFE2" opacity="0.8" />
        {/* Оливка и веточка */}
        <circle cx="240" cy="-30" r="13" fill="#5E6B33" />
        <ellipse cx="245" cy="-35" rx="3.2" ry="4.4" fill="#5B2824" />
        <path d="M212 -52 C240 -66, 276 -66, 300 -52" stroke="#5E6B33" strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="238" cy="-62" rx="5" ry="11" transform="rotate(-24 238 -62)" fill="#5E6B33" />
        <ellipse cx="272" cy="-64" rx="5" ry="11" transform="rotate(20 272 -64)" fill="#4E5A29" />
        {/* Кость */}
        <path d="M0 0 L40 12 L34 26 L-6 14 Z" fill="#E3D4B4" />
      </g>
      {/* Подпись-заглушка */}
      <text x="40" y="530" fill="#9B8B76" fontSize="15" fontFamily="Golos Text, sans-serif">
        Фото клиента: веер нарезки хамона (макро)
      </text>
    </svg>
  );
}
