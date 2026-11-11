import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <img src="/brand/logo-stacked.svg" alt="Наш Хамон — лавка деликатесов" className="brand-logo stacked" width="110" height="90" />
          <p className="footer-intro">
            Лавка деликатесов на Сытном рынке. Хамон — главный герой, вкусы собираем вокруг него.
          </p>
          <ul className="footer-links footer-site-links"><li><Link href="/about">О нас</Link></li><li><a href="/#shop">Наша лавка</a></li><li><a href="/#buyer-choices">Примеры выбора</a></li></ul>
        </div>
        <div>
          <strong className="footer-heading">Контакты</strong>
          <ul className="footer-links">
            <li>Санкт-Петербург, Сытнинская ул., 4П — фуд-аллея рынка «Сытный»</li>
            <li>Вторник–воскресенье, 10:30–20:30</li>
            <li><a href="tel:+79068960099" className="tabular">+7 (906) 896-00-99</a></li>
            <li><a href="mailto:619896@mail.ru">619896@mail.ru</a></li>
          </ul>
        </div>
        <div>
          <strong className="footer-heading">Мы на связи</strong>
          <ul className="footer-links">
            <li><a href="https://t.me/mvn_ge" target="_blank" rel="noopener">Telegram лавки</a></li>
            <li><a href="https://wa.me/79068960099" target="_blank" rel="noopener">WhatsApp</a></li>
            <li><a href="https://vk.com/nashhamon_spb" target="_blank" rel="noopener">ВКонтакте</a></li>
            <li><a href="https://instagram.com/nashhamon.spb" target="_blank" rel="noopener">Instagram @nashhamon.spb</a></li>
            <li><a href="https://yandex.ru/maps/-/CXq~AInl" target="_blank" rel="noopener">Маршрут в Яндекс Картах</a></li>
            <li><a href="https://app.samosale.ru/Nash_khamon/nfc" target="_blank" rel="noopener">Программа лояльности Samosale</a></li>
          </ul>
          <p className="footer-caption">Условия покупки, доставки и сведения о продавце уточняйте у лавки по контактам выше.</p>
        </div>
      </div>
      <div className="container footer-supplier">
        <strong>«Дом Хамона» · Коломна</strong>
        <p>«Наш Хамон — лавка деликатесов» — эксклюзивный дистрибьютор бренда «Дом Хамона» по Санкт-Петербургу и Ленинградской области.</p>
        <p className="footer-slogan">Окорок, соль и время. Ничего лишнего. Сделано в Коломне.</p>
      </div>
      <div className="contact-widget">
        <button type="button" className="contact-trigger" popoverTarget="contact-panel" aria-haspopup="dialog">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 3v-11a9 9 0 0 1 18 0Z M7 10h10M7 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Написать нам
        </button>
        <section id="contact-panel" className="contact-panel" popover="auto" role="dialog" aria-labelledby="contact-title" aria-describedby="contact-description">
          <div className="contact-head">
            <h2 id="contact-title">Напишите нам</h2>
            <button type="button" className="contact-close" popoverTarget="contact-panel" popoverTargetAction="hide" aria-label="Закрыть окно связи" autoFocus>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
          <p id="contact-description" className="contact-description">Выберите, где вам удобно написать.</p>
          <div className="contact-links">
            <a className="contact-link" href="https://t.me/mvn_ge" target="_blank" rel="noopener noreferrer">
              <span><strong>Telegram</strong><small>Личный чат</small></span><span className="arrow-up" aria-hidden="true" />
            </a>
            <a className="contact-link" href="https://wa.me/79068960099" target="_blank" rel="noopener noreferrer">
              <span><strong>WhatsApp</strong><small>Чат по номеру лавки</small></span><span className="arrow-up" aria-hidden="true" />
            </a>
            <a className="contact-link" href="mailto:619896@mail.ru">
              <span><strong>Электронная почта</strong><small>619896@mail.ru</small></span><span className="arrow-up" aria-hidden="true" />
            </a>
          </div>
        </section>
      </div>
    </footer>
  );
}
