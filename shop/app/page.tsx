import Link from 'next/link';
import { connection } from 'next/server';
import HeroLight from '@/components/HeroLight';
import Scenarios from '@/components/Scenarios';
import HomeStories from '@/components/HomeStories';
import ScaleTerminal from '@/components/ScaleTerminal';
import AnimationsLayer from '@/components/Animations';
import { getProducts } from '@/lib/products';
import { reservedPieceIds } from '@/lib/orders';
import { ProductArt } from '@/components/Art';

export const instant = false;

export default async function HomePage() {
  await connection();
  const products = await getProducts();
  const reserved = Array.from(await reservedPieceIds());

  // Хиты витрины: кусок «16», нарезка «22», оливки Gordal
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
    <main id="top">
      {/* СТАРТ: цепляет за 2 секунды, минимум текста */}
      <HeroLight />

      {/* СЦЕНАРИИ: для себя / к столу / на подарок */}
      <Scenarios products={products} />

      {/* ИСТОРИИ */}
      <HomeStories products={products} serverReservedPieceIds={reserved} />

      {/* ХИТЫ ВИТРИНЫ */}
      <section className="section" style={{ borderTop: 'none' }}>
        <div className="container">
          <div className="section-head" style={{ marginBottom: 20 }}>
            <h2 className="section-title">Берут чаще всего</h2>
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
              Вся витрина: 22 позиции
            </Link>
          </p>
        </div>
      </section>

      {/* ВЕС: главный козырь */}
      <ScaleTerminal products={products} />

      {/* ДОСТАВКА: компактно */}
      <section id="delivery" className="section">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">Доставка и оплата</h2>
            <p className="section-subtitle">Фасовка - оплата сразу. Кусок - сначала подтверждаем вес, потом ссылка на точную сумму.</p>
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

      <AnimationsLayer />
    </main>
  );
}
