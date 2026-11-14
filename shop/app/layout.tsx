import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Geologica } from 'next/font/google';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { isDemoMode, siteUrl } from '@/lib/config';
import { CartProvider } from '@/components/CartContext';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import MotionLayer from '@/components/Motion';
import './globals.css';

// The logo is outlined; web headings use Playfair until a licensed Pizza Hut font is supplied.
const playfair = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  weight: ['700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

const geologica = Geologica({
  // latin-ext обязателен: знак ₽ лежит только в этом срезе гарнитуры.
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-geologica',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Наш Хамон — лавка деликатесов в Санкт-Петербурге',
    template: '%s — Наш Хамон',
  },
  description:
    'Хамон, оливки и сыры на Сытном рынке. Выбираете конкретный кусок по весу — цена до рубля. Для себя, к столу и на подарок.',
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Наш Хамон',
    title: 'Наш Хамон — лавка деликатесов',
    description: 'Хамон — главный герой. Вкусы собираем вокруг него: для себя, к столу и на подарок.',
    images: [{ url: '/brand/shop-interior.webp', width: 720, height: 1280, alt: 'Интерьер лавки «Наш Хамон» на Сытном рынке' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Наш Хамон — лавка деликатесов',
    description: 'Хамон — главный герой. Вкусы собираем вокруг него: для себя, к столу и на подарок.',
    images: ['/brand/shop-interior.webp'],
  },
  // Канонический адрес принадлежит каждой странице: Next сливает metadata вниз по
  // дереву, и корневая запись '/' превращала /catalog и все /product/* в дубли главной.
};

export const viewport: Viewport = {
  themeColor: '#5B2824',
};

async function DemoNotice() {
  await connection();
  if (!isDemoMode()) return null;
  return <aside className="site-demo-notice" aria-label="Демонстрационный режим">
    <div className="container"><strong>Демо-магазин.</strong> Заказы тестовые, оплата имитируется — деньги не списываются. Не вводите реальные персональные данные.</div>
  </aside>;
}

function DistributorBar() {
  return <aside className="distributor-bar" aria-label="Поставщик хамона">
    <div className="container">
      <strong>«Наш Хамон» — эксклюзивный дистрибьютор</strong>{' '}
      <span>бренда «Дом Хамона» (Коломна) по Санкт-Петербургу и Ленинградской области</span>
    </div>
  </aside>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${playfair.variable} ${geologica.variable}`}>
      <body>
        <CartProvider>
          <DistributorBar />
          <SiteHeader />
          <Suspense fallback={null}><DemoNotice /></Suspense>
          {children}
          <SiteFooter />
          <MotionLayer />
        </CartProvider>
      </body>
    </html>
  );
}
