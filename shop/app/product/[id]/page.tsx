import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import ProductCard from '@/components/ProductCard';
import AnimationsLayer from '@/components/Animations';
import { getProducts, COUNTRY_NAMES } from '@/lib/products';
import { reservedPieceIds } from '@/lib/orders';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const products = await getProducts();
  const product = products.find((p) => p.id === id);
  if (!product) return { title: 'Товар не найден' };
  return {
    title: product.title,
    description: product.description,
  };
}

export const instant = false;

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const products = await getProducts();
  const product = products.find((p) => p.id === id);
  if (!product) notFound();
  const reserved = Array.from(await reservedPieceIds());

  const per100 = Math.round(product.pricePerKg / 10);
  const meta = (COUNTRY_NAMES[product.country] || '') + (product.agingMonths ? ` · Выдержка ${product.agingMonths}\u00A0мес.` : '');

  return (
    <main className="container" style={{ paddingTop: 24, paddingBottom: 64 }}>
      <p style={{ marginBottom: 16, fontSize: '0.875rem' }}>
        <Link href="/catalog" style={{ color: 'var(--graphite-muted)' }}>← Вся витрина</Link>
      </p>
      <div style={{ maxWidth: 560 }}>
        <ProductCard product={product} serverReservedPieceIds={reserved} />
      </div>
      <section className="section" style={{ maxWidth: 720, marginTop: 32, padding: '32px 0', borderTop: '1px solid var(--bone-line)', borderBottom: 'none' }}>
        <div className="card-meta tabular" style={{ marginBottom: 8 }}>{meta}</div>
        <p className="card-desc" style={{ fontSize: '1rem' }}>{product.description}</p>
        <p className="card-desc tabular" style={{ marginTop: 12 }}>
          Цена ориентира: {per100}{'\u00A0'}₽ / 100{'\u00A0'}г. Вес каждого куска известен при приёмке - итоговая сумма считается по фактическому весу до рубля.
        </p>
      </section>
      <AnimationsLayer />
    </main>
  );
}
