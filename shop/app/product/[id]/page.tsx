import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import ProductCard from '@/components/ProductCard';
import AnimationsLayer from '@/components/Animations';
import { getProducts, CATEGORY_TITLES } from '@/lib/products';
import { reservedPieceIds } from '@/lib/orders';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = (await getProducts()).find((entry) => entry.id === id);
  // Карточка без товара не должна попадать в индекс как пустая страница с canonical.
  return product
    ? { title: product.title, description: product.description, alternates: { canonical: `/product/${product.id}` } }
    : { title: 'Товар не найден', robots: { index: false, follow: false } };
}
export const instant = false;

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const product = (await getProducts()).find((entry) => entry.id === id);
  if (!product) notFound();
  const reserved = Array.from(await reservedPieceIds());
  const fixed = product.kind === 'piece' && product.category === 'leg' && typeof product.pieces[0]?.price === 'number';

  return <main id="main-content" className="container product-page">
    <nav className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/catalog">Каталог</Link><span aria-hidden="true">/</span><Link href={`/catalog?category=${product.category}`}>{CATEGORY_TITLES[product.category].title}</Link></nav>
    <ProductCard product={product} serverReservedPieceIds={reserved} detail />
    <section className="product-information" aria-labelledby="product-info-title">
      <div><h2 id="product-info-title" className="section-title">Перед заказом</h2><dl className="product-facts">{product.code && <div><dt>Артикул поставщика</dt><dd className="tabular">{product.code}</dd></div>}{product.agingMonths && <div><dt>Выдержка</dt><dd>{product.agingMonths} месяцев</dd></div>}<div><dt>Формат</dt><dd>{CATEGORY_TITLES[product.category].title}</dd></div></dl></div>
      <div className="product-order-note"><h3>{fixed ? 'Цена за штуку фиксирована' : product.category === 'extras' ? 'Стоимость за штуку' : product.kind === 'piece' ? 'Точный вес — перед оплатой' : 'Цена выбранной фасовки'}</h3><p>{fixed ? 'После взвешивания стоимость целой ноги не изменится. Указанный вес — ориентир для выбора; подставка приобретается отдельно.' : product.category === 'extras' ? 'Стоимость зависит от выбранного изделия или номинала сертификата и не рассчитывается по весу.' : product.kind === 'piece' ? 'Для среднего куска показываем предварительную сумму. Для отреза под заказ укажите желаемый вес. При сборке подтвердим фактический вес и итоговую стоимость.' : 'Стоимость готовой упаковки фиксирована. Если выбрана порция на развес, окончательную сумму подтвердим после взвешивания.'}</p><p>Точный тариф курьера или доставки в пункт выдачи согласуем до оплаты.</p><Link className="bento-btn" href="/#delivery">Лавка и доставка <span className="arrow" aria-hidden="true"></span></Link></div>
    </section>
    <AnimationsLayer />
  </main>;
}
