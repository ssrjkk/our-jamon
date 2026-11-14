import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import HeroLight from '@/components/HeroLight';
import Scenarios from '@/components/Scenarios';
import HomeStories from '@/components/HomeStories';
import ShopPanel from '@/components/ShopPanel';
import BuyerChoices from '@/components/BuyerChoices';
import SiteTabs from '@/components/SiteTabs';
import ScaleTerminal from '@/components/ScaleTerminal';
import CatalogClient from '@/components/CatalogClient';
import AnimationsLayer from '@/components/Animations';
import { loadCatalog } from '@/lib/products';
import { agingScale } from '@/lib/aging';
import { reservedPieceIds } from '@/lib/orders';
import { revealProps, revealInto } from '@/lib/reveal';
import type { Product } from '@/lib/types';

export const metadata: Metadata = { alternates: { canonical: '/' } };

export const instant = false;

function AgingPanel({ products }: { products: Product[] }) {
  const stages = [
    { period: '8–12 месяцев', title: 'Деликатный', description: 'Мягкая текстура и спокойный мясной вкус. Хороший выбор для первого знакомства.', pairing: 'С томатом, хлебом или спелой дыней.', query: '8-12' },
    { period: '14–22 месяца', title: 'Выразительный', description: 'Более плотная текстура, глубокий вкус и ореховые оттенки. Для неспешной дегустации.', pairing: 'С выдержанным сыром и крупными оливками.', query: '14-22' },
    { period: '24+ месяца', title: 'Зрелый', description: 'Долгая выдержка раскрывает насыщенный аромат и продолжительное послевкусие.', pairing: 'Тонкий ломтик хорош и сам по себе.', query: '24' },
  ];
  const scale = agingScale(products);
  return <section className="section"><div className="container">
    <div className="section-head" {...revealInto('mask')}><h2 className="section-title">Выдержка — это характер</h2><p className="section-subtitle">Больше месяцев — не обязательно лучше для вас. Начните с вкуса, который хочется попробовать.</p></div>
    <div className="bento-3">{stages.map((stage) => <article key={stage.query} className="bento-card aging-card" {...revealProps}><p className="bento-period">{stage.period}</p><h3 className="bento-title">{stage.title}</h3><p>{stage.description}</p><p className="aging-pairing">{stage.pairing}</p><Link href={`/catalog?aging=${stage.query}`} className="bento-btn">Выбрать эту выдержку <span className="arrow" aria-hidden="true"></span></Link></article>)}</div>
    {/* Линейка собрана из agingMonths каталога: деления и высоты штрихов — те же числа,
        по которым фильтр каталога отдаёт список, поэтому полку и ссылку нельзя развести. */}
    <div className="aging-ruler" {...revealProps}>
      <div className="ruler-head"><p className="ruler-title">Что лежит на полке</p><p className="ruler-note">Шаг — {scale.step}{'\u00A0'}мес. Цифра над штрихом — сколько позиций каталога имеют такую выдержку.</p></div>
      <ol className="ruler-track" aria-label="Позиции каталога по месяцам выдержки">
        {scale.cells.map((cell) => <li className={cell.months % 12 === 0 ? 'ruler-cell is-major' : 'ruler-cell'} key={cell.months}>
          {cell.count ? <Link className="ruler-tick" href={`/catalog?aging=${cell.value}`} aria-label={`Выдержка ${cell.label}\u00A0мес. — ${cell.count}`}>
            <span className="ruler-count tabular">{cell.count}</span>
            <span className="ruler-stroke" style={{ '--aging-count': cell.count } as CSSProperties} aria-hidden="true" />
          </Link> : <span className="ruler-blank" aria-hidden="true" />}
          <span className="ruler-month tabular">{cell.label}</span>
        </li>)}
      </ol>
      <p className="ruler-foot">Пустое деление — выдержка, которой сейчас на полке нет.</p>
    </div>
    <div className="tyrosine-callout" {...revealProps}><strong>Белые кристаллы на срезе</strong><p>При длительном созревании в мякоти могут появляться кристаллы тирозина — аминокислоты. Они связаны с естественными процессами выдержки.</p></div>
  </div></section>;
}

function DeliveryPanel() {
  return <section className="section"><div className="container">
    <div className="section-head" {...revealInto('mask')}><h2 className="section-title">Из нашей лавки — к вашему столу</h2><p className="section-subtitle">Самовывоз на Сытном рынке, курьер или пункт выдачи. Точную стоимость курьера и доставки в ПВЗ подтверждаем перед оплатой.</p></div>
    <div className="delivery-grid">
      <article className="bento-card shop-address" {...revealProps}><p className="bento-period">Приходите в гости</p><h3 className="bento-title">Сытнинская, 4П</h3><p>Санкт-Петербург · фуд-аллея рынка «Сытный»</p><p>Вторник–воскресенье, 10:30–20:30</p><a className="btn-primary" href="https://yandex.ru/maps/-/CXq~AInl" target="_blank" rel="noopener noreferrer">Построить маршрут</a><a className="shop-phone" href="tel:+79068960099">+7 (906) 896-00-99</a></article>
      <article className="bento-card" {...revealProps}><h3 className="bento-title">Курьер по Петербургу</h3><p>Укажите адрес при оформлении. Согласуем срок и точную стоимость до оплаты.</p><h3 className="bento-title">Доставка в пункт выдачи</h3><p>Укажите город и удобный ПВЗ. Проверим доступность отправки и подтвердим тариф перед оплатой.</p><div className="delivery-payment"><strong>Оплата после подтверждения</strong><p>Для весовых товаров сначала согласуем фактический вес. Итоговая сумма товаров и доставки будет известна до оплаты.</p></div></article>
    </div>
  </div></section>;
}

export default async function HomePage() {
  await connection();
  const catalog = await loadCatalog();
  const products = catalog.products;
  const reserved = Array.from(await reservedPieceIds());
  return <main id="main-content">
    <HeroLight />
    <SiteTabs panels={{
      catalog: <><HomeStories products={products} /><CatalogClient products={products} previews={catalog.previews} serverReservedPieceIds={reserved} /></>,
      shop: <ShopPanel />,
      'buyer-choices': <BuyerChoices />,
      scenarios: <Scenarios products={products} />,
      aging: <AgingPanel products={products} />,
      'weight-system': <ScaleTerminal products={products} />,
      delivery: <DeliveryPanel />,
    }} />
    <AnimationsLayer />
  </main>;
}
