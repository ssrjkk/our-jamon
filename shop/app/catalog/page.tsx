import type { Metadata } from 'next';
import { connection } from 'next/server';
import CatalogClient from '@/components/CatalogClient';
import AnimationsLayer from '@/components/Animations';
import { getProducts } from '@/lib/products';
import { reservedPieceIds } from '@/lib/orders';

export const metadata: Metadata = {
  title: 'Каталог хамона и деликатесов',
  description: 'Хамон куском, нарезка, целые ноги, оливки и сыры. Выберите средний кусок или закажите отрез нужного веса в лавке «Наш Хамон».',
};
export const instant = false;

export default async function CatalogPage() {
  await connection();
  const products = await getProducts();
  const reserved = Array.from(await reservedPieceIds());
  return <main id="main-content"><CatalogClient products={products} serverReservedPieceIds={reserved} standalone /><AnimationsLayer /></main>;
}
