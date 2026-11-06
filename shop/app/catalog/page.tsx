import type { Metadata } from 'next';
import { connection } from 'next/server';
import CatalogClient from '@/components/CatalogClient';
import AnimationsLayer from '@/components/Animations';
import { getProducts } from '@/lib/products';
import { reservedPieceIds } from '@/lib/orders';

export const metadata: Metadata = {
  title: 'Каталог и выбор кусков по весу',
  description: 'Витрина лавки «Наш Хамон»: хамон куском и в нарезке, целые ноги, оливки, сыры. Выбор конкретного куска по весу из учётной системы.',
};

export const instant = false;

export default async function CatalogPage() {
  await connection();
  const products = await getProducts();
  const reserved = Array.from(await reservedPieceIds());
  return (
    <main>
      <CatalogClient products={products} serverReservedPieceIds={reserved} />
      <AnimationsLayer />
    </main>
  );
}
