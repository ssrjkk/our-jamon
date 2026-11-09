import type { Metadata } from 'next';
import Link from 'next/link';
import ShopPanel from '@/components/ShopPanel';

export const metadata: Metadata = {
  title: 'О нас',
  description: '«Наш Хамон» — лавка деликатесов на Сытном рынке в Санкт-Петербурге. Хамон куском, в нарезке и целые ноги, оливки, сыры и подставки.',
};

export default function AboutPage() {
  return <main id="main-content" className="about-page">
    <section className="section about-intro"><div className="container">
      <nav className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span aria-hidden="true">/</span><span aria-current="page">О нас</span></nav>
      <div className="section-head"><p className="bento-period">Наш Хамон · Сытный рынок</p><h1 className="section-title">О нас</h1><p className="section-subtitle">Небольшая лавка с главным героем — хамоном. Мы на фуд-аллее Сытного рынка в Санкт-Петербурге.</p></div>
      <div className="about-facts-grid">
        <article><h2 className="bento-title">Что в лавке</h2><p>Хамон куском и в нарезке, целые ноги и палеты. Рядом — оливки, выдержанные сыры, антипасти, хамонеры и нож для нарезки. Конкретные товары и цены смотрите в каталоге.</p><Link href="/catalog" className="shop-phone">Открыть каталог →</Link></article>
        <article><h2 className="bento-title">Как выбираем вес</h2><p>У конкретного куска указан его вес. Для среднего куска и желаемого отреза расчёт предварительный: фактический вес и итоговую сумму подтверждаем до оплаты. Упаковки и подставки имеют цену за выбранный вариант.</p><a href="/#weight-system" className="shop-phone">Как считаем вес →</a></article>
        <article><h2 className="bento-title">Как связаться</h2><p>Уточнить наличие, задать вопрос о товаре или согласовать получение можно по телефону <a href="tel:+79068960099">+7 (906) 896-00-99</a> и в <a href="https://t.me/mvn_ge" target="_blank" rel="noopener noreferrer">Telegram лавки</a>. Срок и стоимость доставки согласуются до оплаты.</p><a href="mailto:619896@mail.ru" className="shop-phone">619896@mail.ru</a></article>
      </div>
    </div></section>
    <ShopPanel showAboutLink={false} />
  </main>;
}
