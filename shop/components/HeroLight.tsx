export default function HeroLight() {
  return (
    <section className="hero-light" aria-labelledby="hero-title">
      <div className="container hero-light-grid">
        <div className="hero-copy">
          <p className="hero-location">Санкт-Петербург · Сытный рынок</p>
          <h1 id="hero-title" className="hero-big">Хамон — главный герой нашей лавки.</h1>
          <p className="hero-sub">Подберем вкус для каждого</p>
          <div className="hero-cta-row">
            <a href="#catalog" className="btn-primary">Выбрать хамон <span aria-hidden="true">→</span></a>
            <a href="#shop" className="btn-secondary">Найти лавку</a>
          </div>
          <p className="hero-footnote">Оливки, выдержанные сыры и всё, что хорошо рядом.</p>
        </div>
        <figure className="hero-sign">
          <div className="hero-photo"><img src="/brand/hero-slicing.webp" alt="Нож снимает ломтик с мраморного куска хамона" width={1314} height={1230} fetchPriority="high" decoding="async" /></div>
          <figcaption className="hero-sign-foot"><span>Сытнинская, <strong>4П</strong></span><span>Вт–вс<br />10:30–20:30</span></figcaption>
        </figure>
      </div>
    </section>
  );
}
