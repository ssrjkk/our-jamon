import type { Metadata } from 'next';
import { Playfair_Display, Golos_Text } from 'next/font/google';
import { CartProvider } from '@/components/CartContext';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import './globals.css';

// Фирменная типографика: плакатная антиква с кириллицей (как на постере
// программы лояльности) + прагматичный гротеск для интерфейса.
const playfair = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  weight: ['700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

const golos = Golos_Text({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-golos',
  display: 'swap',
});

const SITE_URL = process.env.SHOP_URL || 'https://ssrjkk.github.io/our-jamon';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Наш Хамон — лавка деликатесов в Санкт-Петербурге',
    template: '%s — Наш Хамон',
  },
  description:
    'Хамон, оливки и сыры на Сытном рынке. Выбираете конкретный кусок по весу - цена до рубля. Для себя, к столу и на подарок.',
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Наш Хамон',
    title: 'Наш Хамон — лавка деликатесов',
    description: 'Хамон - главный герой. Вкусы собираем вокруг него: для себя, к столу и на подарок.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${playfair.variable} ${golos.variable}`}>
      <body>
        <CartProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
        </CartProvider>
      </body>
    </html>
  );
}
