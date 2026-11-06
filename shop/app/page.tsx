import Link from 'next/link';
import { connection } from 'next/server';
import HeroLight from '@/components/HeroLight';
import Scenarios from '@/components/Scenarios';
import HomeStories from '@/components/HomeStories';
import SiteTabs from '@/components/SiteTabs';
import ScaleTerminal from '@/components/ScaleTerminal';
import AnimationsLayer from '@/components/Animations';
import { getProducts } from '@/lib/products';
import { reservedPieceIds } from '@/lib/orders';
import { ProductArt } from '@/components/Art';

export const instant = false;

function AgingPanel() {
  return (
    <section className="section" style={{ borderTop: 'none' }}>
      <div className="container">
        <div className="section-head">
          <h2 className="section-title">Выдержка от 8 до 28+ месяцев</h2>
          <p className="section-subtitle">Срок созревания определяет плотность мякоти, сладость жира и глубину орехового послевкусия.</p>
        </div>
        <div className="bento-3">
          <article className="bento-card">
            <div>
              <div className="bento-period">8–12 месяцев</div>
              <h3 className="bento-title">Bodega</h3>
            </div>
            <ul className="bento-list">
              <li><strong>Текстура:</strong> мягкая, сочная, легко режется тонкими ломтиками.</li>
              <li><strong>Вкус:</strong> деликатный, с умеренной солью и чистым мясным профилем.</li>
              <li><strong>С чем подавать:</strong> тёплая чиабатта с томатом, спелая дыня, инжир.</li>
            </ul>
            <Link href="/catalog?aging=8-12" className="bento-btn">Показать хамон этой выдержки</Link>
          </article>
          <article className="bento-card">
            <div>
              <div className="bento-period">14–18 месяцев</div>
              <h3 className="bento-title">Reserva</h3>
            </div>
            <ul className="bento-list">
              <li><strong>Текстура:</strong> плотный рубиновый срез с золотистой жировой прослойкой.</li>
              <li><strong>Вкус:</strong> насыщенный, с ореховой нотой и долгим послевкусием.</li>
              <li><strong>С чем подавать:</strong> овечий сыр Манчего, крупные оливки Gordal, Темпранильо.</li>
            </ul>
            <Link href="/catalog?aging=14-18" className="bento-btn">Показать хамон этой выдержки</Link>
          </article>
          <article className="bento-card">
            <div>
              <div className="bento-period">24–28+ месяцев</div>
              <h3 className="bento-title">Gran Reserva</h3>
            </div>
            <ul className="bento-list">
              <li><strong>Текстура:</strong> тёмно-бордовая вяленая мякоть, жир тает при комнатной температуре.</li>
              <li><strong>Вкус:</strong> концентрированный умами, сухофрукты, жареный фундук.</li>
              <li><strong>С чем подавать:</strong> сольно, с сухим хересом или брютом Cava.</li>
            </ul>
            <Link href="/catalog?aging=24" className="bento-btn">Показать хамон этой выдержки</Link>
          </article>
        </div>
        <div className="tyrosine-callout">
          <strong>Что означают белые точки на срезе хамона</strong>
          <p>Мелкие белые вкрапления в мякоти — кристаллы аминокислоты тирозина. Знак долгого естественного созревания.</p>
        </div>
      </div>
    </section>
  );
}

function DeliveryPanel() {
  return (
    <section id="delivery" className="section" style={{ borderTop: 'none' }}>
      <div className="container">
        <div className="section-head">
          <h2 className="section-title">Доставка и оплата</h2>
          <p className="section-subtitle">Фасовка — оплата сразу. Кусок — сначала подтверждаем вес, потом ссылка на точную сумму.</p>
        </div>
        <div className="delivery-grid">
          <div className="bento-card">
            <h3 className="bento-title">Курьер по СПб, день в день</h3>
            <p>Яндекс и Drivee. Бесплатно от 3 000 ₽ <span className="tabular">[порог уточнить]</span></p>
          </div>
          <div className="bento-card">
            <h3 className="bento-title">СДЭК по России</h3>
            <p>Пункты выдачи, вакуумная упаковка <span className="tabular">[заглушка тарифов]</span></p>
          </div>
          <div className="bento-card">
            <h3 className="bento-title">Самовывоз</h3>
            <p>Сытнинская, 4П · вт–вс 10:30–20:30</p>
          </div>
          <div className="bento-card">
            <h3 className="bento-title">Т-Банк</h3>
            <p>Карта или СБП, чек автоматически</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function HitsPanel({ products, reserved }: { products: Awaited<ReturnType<typeof getProducts>>; reserved: string[] }) {
  void reserved;
  const hits = ['hamon-16-piece', 'hamon-sliced-22', 'olives-gordal']
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const hitPrice = (p: (typeof hits)[number]) => {
    if (p.kind === 'piece') {
      const piece = p.pieces[0];
      return piece.price ?? Math.round((piece.weightG / 1000) * p.pricePerKg);
    }
    return p.packs[0].price;
  };

  return (
    <section className="section" style={{ borderTop: 'none' }}>
      <div className="container">
        <div className="section-head" style={{ marginBottom: 20 }}>
          <h2 className="section-title">Берут чаще всего</h2>
          <p className="section-subtitle">Полная витрина - в каталоге: 26 позиций в шести отделах, включая хамонеры и подарочные сертификаты.</p>
        </div>
        <div className="catalog-grid">
          {hits.map((p) => (
            <Link
              key={p.id}
              href={`/product/${p.id}`}
              className="product-card"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div>
                <div className="card-media">
                  <ProductArt product={p} />
                </div>
                <div className="card-header-row">
                  <h3 className="card-title">{p.title}</h3>
                  <span className="rate-per-100 tabular">{Math.round(p.pricePerKg / 10)}{'\u00A0'}₽ / 100{'\u00A0'}г</span>
                </div>
              </div>
              <div className="card-footer">
                <div className="price-stack">
                  <span className="price-label">от</span>
                  <strong className="price-value tabular">{hitPrice(p)}{'\u00A0'}₽</strong>
                </div>
                <span className="add-btn" style={{ pointerEvents: 'none' }}>Смотреть</span>
              </div>
            </Link>
          ))}
        </div>
        <p style={{ marginTop: 18 }}>
          <Link href="/catalog" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            Вся витрина
          </Link>
        </p>
      </div>
    </section>
  );
}

export default async function HomePage() {
  await connection();
  const products = await getProducts();
  const reserved = Array.from(await reservedPieceIds());

  return (
    <main id="top">
      {/* СТАРТ: цепляет за 2 секунды */}
      <HeroLight />

      {/* ИСТОРИИ */}
      <HomeStories products={products} serverReservedPieceIds={reserved} />

      {/* ВКЛАДКИ: витрина / сценарии / выдержка / вес / доставка */}
      <SiteTabs
        panels={{
          catalog: <HitsPanel products={products} reserved={reserved} />,
          scenarios: <Scenarios products={products} />,
          aging: <AgingPanel />,
          'weight-system': <ScaleTerminal products={products} />,
          delivery: <DeliveryPanel />,
        }}
      />

      <AnimationsLayer />
    </main>
  );
}
