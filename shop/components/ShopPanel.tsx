import Link from 'next/link';

export default function ShopPanel({ showAboutLink = true }: { showAboutLink?: boolean }) {
  return <section className="section shop-section" aria-labelledby="shop-heading">
    <div className="container shop-visit-grid">
      <figure className="shop-interior">
        <img src="/brand/shop-interior.webp" width="720" height="1280" loading="lazy" decoding="async"
          alt="Интерьер лавки «Наш Хамон»: стеклянная витрина и светящаяся вывеска с окороком на красной стене" />
        <figcaption>Наша лавка на Сытном рынке. Фото интерьера; актуальные товары и цены — в каталоге.</figcaption>
      </figure>
      <div className="shop-visit-copy">
        <p className="bento-period">Санкт-Петербург · Сытный рынок</p>
        <h2 id="shop-heading" className="section-title">Наша лавка</h2>
        <p className="section-subtitle">Та самая вывеска. Настоящая витрина. Приходите выбрать свой хамон.</p>
        <dl className="shop-facts">
          <div><dt>Где мы</dt><dd>Сытнинская улица, 4П<br />Фуд-аллея рынка «Сытный»</dd></div>
          <div><dt>Когда открыты</dt><dd>Вторник–воскресенье<br /><span className="tabular">10:30–20:30</span></dd></div>
          <div><dt>Связаться с лавкой</dt><dd><a href="tel:+79068960099" className="tabular">+7 (906) 896-00-99</a><br /><a href="mailto:619896@mail.ru">619896@mail.ru</a></dd></div>
        </dl>
        <p className="shop-visit-note">Перед поездкой уточните наличие нужного товара по телефону.</p>
        <div className="hero-cta-row">
          <a className="btn-primary" href="https://yandex.ru/maps/-/CXq~AInl" target="_blank" rel="noopener noreferrer">Маршрут в Яндекс Картах <span aria-hidden="true">↗</span></a>
          {showAboutLink && <Link href="/about" className="btn-secondary">О нас <span aria-hidden="true">→</span></Link>}
        </div>
      </div>
    </div>
    <div className="container shop-supplier-strip">
      <figure>
        <img src="/brand/supplier-sliced-macro.webp" width="1230" height="530" style={{ maxWidth: 615 }} loading="lazy" decoding="async"
          alt="Вакуумная нарезка хамона в фирменной упаковке поставщика «Дом Хамона» на золотой подложке" />
        <figcaption>Витрина поставщика «Дом Хамона» · Коломна. Фото из брендбука бренда.</figcaption>
      </figure>
      <figure>
        <img src="/brand/supplier-leg-tag.webp" width="740" height="600" style={{ maxWidth: 370 }} loading="lazy" decoding="async"
          alt="Нога хамона с картонной биркой выдержки «10 Madrid» поставщика «Дом Хамона»" />
        <figcaption>Нога с биркой выдержки поставщика.</figcaption>
      </figure>
    </div>
  </section>;
}
