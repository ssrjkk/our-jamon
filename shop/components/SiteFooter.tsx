import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <img src="/brand/logo-stacked.svg" alt="Наш Хамон — лавка деликатесов" className="brand-logo stacked" style={{ marginBottom: 12 }} />
          <p style={{ color: 'var(--graphite-muted)', maxWidth: '44ch' }}>
            Лавка деликатесов на Сытном рынке. Хамон — главный герой, вкусы собираем вокруг него.
          </p>
          <p className="footer-caption">
            Продукт «Дом Хамона»: производство по ГОСТ 34159-2017, маркировка «Честный знак» и АИС «Меркурий».
          </p>
        </div>
        <div>
          <strong style={{ display: 'block', marginBottom: 8 }}>Контакты</strong>
          <ul className="footer-links">
            <li>Санкт-Петербург, Сытнинская ул., 4П — фуд-аллея рынка «Сытный»</li>
            <li>Вторник–воскресенье, 10:30–20:30</li>
            <li><a href="tel:+79068960099" className="tabular">+7 (906) 896-00-99</a></li>
            <li><a href="mailto:619896@mail.ru">619896@mail.ru</a></li>
          </ul>
        </div>
        <div>
          <strong style={{ display: 'block', marginBottom: 8 }}>Мы на связи</strong>
          <ul className="footer-links">
            <li><a href="https://t.me/mvn_ge" target="_blank" rel="noopener">Telegram лавки</a></li>
            <li><a href="https://wa.me/79068960099" target="_blank" rel="noopener">WhatsApp</a></li>
            <li><a href="https://vk.com/nashhamon_spb" target="_blank" rel="noopener">ВКонтакте</a></li>
            <li><a href="https://instagram.com/nashhamon.spb" target="_blank" rel="noopener">Instagram @nashhamon.spb</a></li>
            <li><a href="https://yandex.ru/maps/-/CXq~AInl" target="_blank" rel="noopener">Маршрут в Яндекс Картах</a></li>
            <li><a href="https://app.samosale.ru/Nash_khamon/nfc" target="_blank" rel="noopener">Программа лояльности Samosale</a></li>
          </ul>
          {/* ЗАМЕНИТЬ: вписать реквизиты продавца (ИП/ООО, ИНН, ОГРНИП) */}
          <p className="footer-caption">[Заглушка реквизитов: ИП/ООО, ИНН, ОГРНИП]</p>
        </div>
      </div>
    </footer>
  );
}
