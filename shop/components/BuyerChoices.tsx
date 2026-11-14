import Link from 'next/link';
import { revealInto } from '@/lib/reveal';

const CHOICES = [
  { id: 'self', label: 'Для себя', photos: [
    { src: '/brand/choice-self.webp', alt: 'Подборка для себя: соль в мельнице, туррон, сыр и баночные деликатесы', caption: 'Подборка под свой вкус' },
  ] },
  { id: 'table', label: 'К столу', photos: [
    { src: '/brand/choice-table-1.webp', alt: 'Подборка к столу: хамон, гриссини и баночные деликатесы', caption: 'Первый вариант к столу' },
    { src: '/brand/choice-table-2.webp', alt: 'Второй вариант к столу: хамон, упакованные сыры и банки деликатесов', caption: 'Второй вариант к столу' },
  ] },
  { id: 'gift', label: 'На подарок', photos: [
    { src: '/brand/choice-gift.webp', alt: 'Подборка на подарок: хамон, сыр и баночные деликатесы', caption: 'Подарок со вкусом' },
  ] },
];

export function ChoicePhotos() {
  return <>
    <p className="photo-choice-hint">На небольшом экране фотографии можно листать в сторону.</p>
    <div className="photo-choice-gallery" role="region" aria-label="Фотографии подборок из лавки" tabIndex={0}>
      {CHOICES.map((choice) => <article key={choice.id} className="photo-choice-group" data-choice-category={choice.id} {...revealInto('clip')}>
        <h3 className="photo-choice-title">{choice.label}</h3>
        <div className="photo-choice-images">{choice.photos.map((photo) => <figure key={photo.src}>
          <img src={photo.src} alt={photo.alt} width="720" height="1280" loading="lazy" decoding="async" />
          <figcaption>{photo.caption}</figcaption>
        </figure>)}</div>
      </article>)}
    </div>
  </>;
}

export default function BuyerChoices() {
  return <section className="section" aria-labelledby="buyer-choices-heading"><div className="container">
    <div className="section-head" {...revealInto('mask')}><h2 id="buyer-choices-heading" className="section-title">Выбор покупателей</h2><p className="section-subtitle">Для себя, к общему столу или на подарок — настоящие подборки из нашей лавки.</p></div>
    <ChoicePhotos />
    <div className="photo-choice-footer"><p>На фото — примеры выбора. Состав, наличие и стоимость подберём отдельно под ваш запрос.</p><div className="hero-cta-row"><Link href="/catalog" className="btn-primary">Выбрать в каталоге</Link><a href="tel:+79068960099" className="btn-secondary">Уточнить подборку</a></div></div>
  </div></section>;
}
