import { Product } from '@/lib/types';

// ЗАМЕНИТЬ: фото продукции @nashhamon.spb — <Image src="..." width={400} height={300} />
// Пока расставлены фирменные векторные заглушки 4:3.

export function ProductArt({ product }: { product: Product }) {
  const caption = `Фото клиента 4:3 - ${product.title}`;
  if (product.id === 'hamonera-pine' || product.id === 'hamonera-oak') {
    const wood = product.id === 'hamonera-oak' ? '#5C4430' : '#8A6A4A';
    return (
      <svg viewBox="0 0 400 300" aria-hidden="true">
        <rect width="400" height="300" fill="#EFE9DB" />
        <ellipse cx="200" cy="248" rx="130" ry="14" fill="#E0D7C0" />
        <rect x="60" y="228" width="280" height="18" rx="5" fill={wood} />
        <path d="M110 228 L150 228 L168 130 L146 130 Z" fill={wood} />
        <path d="M290 228 L250 228 L232 130 L254 130 Z" fill={wood} />
        <rect x="140" y="116" width="120" height="16" rx="5" fill="#6B5138" />
        <circle cx="146" cy="124" r="4" fill="#EFE9DB" />
        <circle cx="254" cy="124" r="4" fill="#EFE9DB" />
        <path d="M150 112 C210 80, 285 74, 312 98 C326 110, 322 126, 308 134 L286 146 C230 162, 184 152, 150 130 Z" fill="#5B2824" />
        <path d="M168 106 C224 86, 284 82, 310 98" stroke="#7A3A32" strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M164 118 C226 100, 292 98, 318 114" stroke="#F6F5F0" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.85" />
        <path d="M150 112 L134 98 L124 110 L140 124 Z" fill="#E3D4B4" />
        <text x="20" y="276" fill="#5C5752" fontSize="12" fontFamily="Golos Text, sans-serif">{caption}</text>
      </svg>
    );
  }
  if (product.id === 'hamon-knife') {
    return (
      <svg viewBox="0 0 400 300" aria-hidden="true">
        <rect width="400" height="300" fill="#EFE9DB" />
        <ellipse cx="200" cy="248" rx="130" ry="14" fill="#E0D7C0" />
        <path d="M80 210 L250 120 L268 138 L98 228 Z" fill="#C9C2B4" stroke="#8F887A" strokeWidth="2" />
        <path d="M86 206 L244 124" stroke="#EFEAE0" strokeWidth="4" fill="none" strokeLinecap="round" />
        <rect x="248" y="104" width="76" height="24" rx="8" transform="rotate(-30 248 104)" fill="#241B17" />
        <rect x="238" y="118" width="18" height="10" rx="3" transform="rotate(-30 238 118)" fill="#5B2824" />
        <text x="20" y="276" fill="#5C5752" fontSize="12" fontFamily="Golos Text, sans-serif">{caption}</text>
      </svg>
    );
  }
  if (product.id === 'gift-certificate') {
    return (
      <svg viewBox="0 0 400 300" aria-hidden="true">
        <rect width="400" height="300" fill="#E9E0CD" />
        <rect x="96" y="52" width="208" height="196" rx="6" fill="#FAF5EA" stroke="#5B2824" strokeWidth="3" />
        <rect x="108" y="64" width="184" height="172" rx="4" fill="none" stroke="#5B2824" strokeWidth="1.4" strokeDasharray="6 5" />
        <text x="200" y="128" textAnchor="middle" fill="#5B2824" fontFamily="Playfair Display, Georgia, serif" fontSize="30" fontWeight="700">Подарок</text>
        <text x="200" y="158" textAnchor="middle" fill="#6E6155" fontFamily="Golos Text, sans-serif" fontSize="13">Наш Хамон</text>
        <rect x="150" y="176" width="100" height="10" rx="3" fill="#5B2824" />
        <circle cx="200" cy="222" r="10" fill="#5B2824" />
        <path d="M186 216 L200 232 L214 216" stroke="#FAF5EA" strokeWidth="3" fill="none" strokeLinecap="round" />
        <text x="20" y="276" fill="#5C5752" fontSize="12" fontFamily="Golos Text, sans-serif">{caption}</text>
      </svg>
    );
  }
  if (product.category === 'olives') {
    return (
      <svg viewBox="0 0 400 300" aria-hidden="true">
        <rect width="400" height="300" fill="#E9E5D8" />
        <path d="M150 96 L250 96 L242 232 L158 232 Z" fill="#D8D3C2" stroke="#181615" strokeWidth="2" />
        <rect x="144" y="82" width="112" height="18" rx="4" fill="#B8AE96" stroke="#181615" strokeWidth="1.6" />
        <circle cx="188" cy="176" r="22" fill="#4E5E32" />
        <ellipse cx="195" cy="168" rx="5" ry="7" fill="#7A1C1C" />
        <circle cx="216" cy="196" r="19" fill="#3E4B27" />
        <ellipse cx="211" cy="190" rx="4" ry="6" fill="#7A1C1C" />
        <path d="M120 130 C150 108, 200 102, 240 112" stroke="#4E5E32" strokeWidth="5" fill="none" strokeLinecap="round" />
        <ellipse cx="150" cy="112" rx="7" ry="15" transform="rotate(-28 150 112)" fill="#4E5E32" />
        <ellipse cx="212" cy="104" rx="7" ry="15" transform="rotate(20 212 104)" fill="#3E4B27" />
        <ellipse cx="176" cy="100" rx="6" ry="13" fill="#5D6E3C" />
        <text x="20" y="276" fill="#5C5752" fontSize="12" fontFamily="Golos Text, sans-serif">{caption}</text>
      </svg>
    );
  }
  if (product.category === 'cheese') {
    return (
      <svg viewBox="0 0 400 300" aria-hidden="true">
        <rect width="400" height="300" fill="#EFECE4" />
        <path d="M70 210 L290 92 L330 210 Z" fill="#E3D4B4" stroke="#181615" strokeWidth="2.4" />
        <path d="M70 210 L290 92" stroke="#F6F5F0" strokeWidth="5" fill="none" strokeLinecap="round" />
        <circle cx="252" cy="164" r="9" fill="#C9B48E" />
        <circle cx="196" cy="182" r="6" fill="#C9B48E" />
        <circle cx="286" cy="150" r="4" fill="#D9C49C" />
        <ellipse cx="150" cy="238" rx="66" ry="12" fill="#DDD6C6" />
        <circle cx="118" cy="232" r="14" fill="#7A1C1C" />
        <circle cx="146" cy="238" r="12" fill="#8E2A24" />
        <text x="20" y="276" fill="#5C5752" fontSize="12" fontFamily="Golos Text, sans-serif">{caption}</text>
      </svg>
    );
  }
  if (product.category === 'leg') {
    return (
      <svg viewBox="0 0 400 300" aria-hidden="true">
        <rect width="400" height="300" fill="#2A2521" />
        <rect x="70" y="238" width="260" height="10" rx="3" fill="#5C5752" />
        <path d="M110 238 L150 238 L172 120 L152 120 Z" fill="#4E4438" />
        <path d="M290 238 L250 238 L228 120 L248 120 Z" fill="#4E4438" />
        <rect x="146" y="106" width="108" height="16" rx="5" fill="#5C5752" />
        <path d="M150 108 C210 74, 290 66, 320 92 C336 106, 334 124, 318 134 L292 148 C230 168, 178 156, 150 130 Z" fill="#7A1C1C" />
        <path d="M170 104 C230 82, 290 78, 318 96" stroke="#A03A32" strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d="M166 118 C230 98, 300 96, 326 114" stroke="#F6F5F0" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85" />
        <circle cx="296" cy="104" r="2.6" fill="#F6F5F0" opacity="0.9" />
        <circle cx="272" cy="120" r="2" fill="#F6F5F0" opacity="0.8" />
        <path d="M150 108 L132 94 L120 108 L138 126 Z" fill="#E3D4B4" />
        <rect x="112" y="92" width="14" height="20" rx="3" fill="#C9B48E" />
        <text x="20" y="276" fill="#9E978F" fontSize="12" fontFamily="Golos Text, sans-serif">{caption}</text>
      </svg>
    );
  }
  if (product.category === 'sliced') {
    return (
      <svg viewBox="0 0 400 300" aria-hidden="true">
        <rect width="400" height="300" fill="#EAE6DC" />
        <rect x="86" y="84" width="228" height="132" rx="8" fill="#CFC9B8" stroke="#181615" strokeWidth="2.4" />
        <path d="M96 96 L304 96" stroke="#F6F5F0" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        <rect x="112" y="112" width="176" height="12" rx="6" fill="#B9524A" />
        <rect x="112" y="130" width="176" height="12" rx="6" fill="#A03A32" />
        <rect x="112" y="148" width="176" height="12" rx="6" fill="#B9524A" />
        <rect x="112" y="166" width="176" height="12" rx="6" fill="#A03A32" />
        <rect x="112" y="184" width="176" height="12" rx="6" fill="#B9524A" />
        <rect x="238" y="196" width="76" height="34" rx="3" fill="#F6F5F0" stroke="#181615" strokeWidth="1.6" transform="rotate(-4 276 213)" />
        <line x1="248" y1="208" x2="300" y2="206" stroke="#5C5752" strokeWidth="2" />
        <line x1="248" y1="216" x2="296" y2="214" stroke="#5C5752" strokeWidth="2" />
        <text x="20" y="276" fill="#5C5752" fontSize="12" fontFamily="Golos Text, sans-serif">{caption}</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 400 300" aria-hidden="true">
      <rect width="400" height="300" fill="#EAE5DC" />
      <ellipse cx="200" cy="252" rx="140" ry="16" fill="#DDD6C6" />
      <path d="M90 210 C130 130, 250 110, 322 152 L306 196 C230 214, 150 224, 90 210 Z" fill="#7A1C1C" />
      <path d="M120 190 C170 150, 250 138, 306 162" stroke="#F6F5F0" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M134 200 C190 168, 264 158, 310 174" stroke="#E5DEC9" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8" />
      <circle cx="272" cy="150" r="3" fill="#F6F5F0" opacity="0.9" />
      <circle cx="240" cy="142" r="2.4" fill="#F6F5F0" opacity="0.8" />
      <circle cx="200" cy="148" r="2" fill="#F6F5F0" opacity="0.8" />
      <path d="M84 214 L64 198 L52 214 L72 232 Z" fill="#E3D4B4" />
      <text x="20" y="276" fill="#5C5752" fontSize="12" fontFamily="Golos Text, sans-serif">{caption}</text>
    </svg>
  );
}

// ЗАМЕНИТЬ: реальный видеофайл нарезки хамона — <video src="..." poster="...">
export function HeroArt() {
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="Заглушка видео: окорок хамона на хамонере">
      <rect width="800" height="600" fill="#231D1A" />
      <rect x="0" y="470" width="800" height="130" fill="#1B1815" />
      <path d="M180 470 L260 470 L300 240 L270 240 Z" fill="#4E4438" />
      <path d="M620 470 L540 470 L500 240 L530 240 Z" fill="#4E4438" />
      <rect x="150" y="464" width="500" height="14" rx="4" fill="#5C5752" />
      <rect x="258" y="226" width="284" height="20" rx="6" fill="#5C5752" />
      <path d="M300 236 C380 176, 500 158, 560 186 C610 210, 616 248, 588 268 L560 286 C470 316, 360 300, 300 262 Z" fill="#7A1C1C" />
      <path d="M330 232 C400 196, 480 186, 548 206" stroke="#A03A32" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M322 250 C400 220, 496 214, 566 240" stroke="#F6F5F0" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.85" />
      <path d="M336 262 C410 238, 500 234, 560 254" stroke="#E5DEC9" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
      <circle cx="578" cy="246" r="3" fill="#F6F5F0" opacity="0.9" />
      <circle cx="556" cy="228" r="2.4" fill="#F6F5F0" opacity="0.8" />
      <circle cx="520" cy="252" r="2" fill="#F6F5F0" opacity="0.8" />
      <path d="M300 236 L272 216 L258 232 L286 258 Z" fill="#E3D4B4" />
      <rect x="248" y="216" width="18" height="24" rx="4" fill="#C9B48E" />
      <ellipse cx="348" cy="248" rx="46" ry="26" fill="#A03A32" />
      <ellipse cx="348" cy="248" rx="40" ry="21" fill="#B9524A" />
      <path d="M318 244 C334 234, 362 232, 382 240" stroke="#F6F5F0" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M322 256 C340 250, 366 250, 384 256" stroke="#F6F5F0" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M352 272 C356 300, 350 330, 336 352 L356 350 C366 324, 368 298, 364 274 Z" fill="#B9524A" />
      <path d="M384 270 C392 296, 388 322, 376 342 L392 338 C402 316, 402 292, 398 272 Z" fill="#A03A32" />
      <ellipse cx="200" cy="540" rx="120" ry="26" fill="#2A2521" />
      <ellipse cx="200" cy="534" rx="120" ry="24" fill="#3A332C" />
      <path d="M120 528 C150 508, 250 506, 282 526 C250 516, 152 518, 120 528 Z" fill="#B9524A" />
      <path d="M128 518 C160 500, 244 498, 274 516 C240 508, 162 510, 128 518 Z" fill="#C96A5F" />
      <circle cx="420" cy="532" r="13" fill="#4E5E32" />
      <ellipse cx="425" cy="527" rx="3.4" ry="4.6" fill="#7A1C1C" />
      <circle cx="452" cy="540" r="11" fill="#3E4B27" />
      <path d="M410 512 C440 496, 480 494, 508 506" stroke="#4E5E32" strokeWidth="4" fill="none" strokeLinecap="round" />
      <ellipse cx="440" cy="500" rx="5" ry="11" transform="rotate(-30 440 500)" fill="#4E5E32" />
      <ellipse cx="474" cy="498" rx="5" ry="11" transform="rotate(24 474 498)" fill="#3E4B27" />
      <text x="60" y="580" fill="#9E978F" fontSize="15" fontFamily="Golos Text, sans-serif">
        Видеозаглушка: окорок на хамонере. Видео нарезки - от @nashhamon.spb
      </text>
    </svg>
  );
}

export const STORY_ART: Record<string, React.ReactNode> = {
  cut: (
    <svg viewBox="0 0 96 96" fill="none">
      <path d="M20 70 L76 70 L72 62 L24 62 Z" fill="#5C5752" />
      <rect x="46" y="26" width="4" height="38" fill="#5C5752" />
      <path d="M24 30 C48 20, 76 24, 72 46 C68 60, 40 62, 26 52 Z" fill="#7A1C1C" />
      <path d="M32 38 C48 30, 62 32, 68 42" stroke="#F6F5F0" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="26" cy="34" rx="4" ry="6" fill="#E3D4B4" />
    </svg>
  ),
  evening: (
    <svg viewBox="0 0 96 96" fill="none">
      <ellipse cx="48" cy="64" rx="30" ry="8" fill="#DDD8CE" />
      <circle cx="34" cy="52" r="10" fill="#4E5E32" />
      <ellipse cx="38" cy="50" rx="2.4" ry="3.4" fill="#7A1C1C" />
      <circle cx="58" cy="50" r="8" fill="#3E4B27" />
      <rect x="68" y="38" width="4" height="20" fill="#5C5752" />
      <path d="M56 24 C64 20, 72 22, 70 30 C68 36, 58 36, 56 30 Z" fill="#7A1C1C" />
    </svg>
  ),
  weigh: (
    <svg viewBox="0 0 96 96" fill="none">
      <rect x="24" y="58" width="48" height="18" rx="4" fill="#181615" />
      <rect x="32" y="30" width="32" height="24" rx="3" fill="#F6F5F0" stroke="#181615" strokeWidth="2" />
      <text x="36" y="47" fontFamily="Golos Text, sans-serif" fontSize="12" fill="#7A1C1C">230</text>
      <rect x="30" y="24" width="36" height="4" rx="2" fill="#181615" />
    </svg>
  ),
  aging: (
    <svg viewBox="0 0 96 96" fill="none">
      <path d="M20 72 C36 68, 44 56, 52 40 C58 28, 68 22, 78 20" stroke="#7A1C1C" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="34" cy="66" r="3" fill="#DDD8CE" />
      <circle cx="52" cy="44" r="3" fill="#F6F5F0" />
      <circle cx="70" cy="26" r="3" fill="#F6F5F0" />
      <circle cx="76" cy="30" r="1.6" fill="#F6F5F0" />
      <circle cx="66" cy="24" r="1.6" fill="#F6F5F0" />
    </svg>
  ),
  shop: (
    <svg viewBox="0 0 96 96" fill="none">
      <rect x="22" y="40" width="52" height="34" fill="#F6F5F0" stroke="#181615" strokeWidth="2" />
      <path d="M18 40 L78 40 L72 26 L24 26 Z" fill="#7A1C1C" />
      <rect x="40" y="52" width="16" height="22" fill="#4E5E32" />
      <rect x="60" y="48" width="8" height="8" fill="#DDD8CE" />
    </svg>
  ),
};
