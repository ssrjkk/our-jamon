import type { Metadata } from 'next';
import { connection } from 'next/server';
import CartClient from '@/components/CartClient';
import { getDeliveryOptions, freeDeliveryFrom } from '@/lib/delivery';
import { isDemoMode } from '@/lib/config';

export const metadata: Metadata = { title: 'Корзина', robots: { index: false } };
export const instant = false;

export default async function CartPage() {
  await connection();
  return <CartClient deliveryOptions={getDeliveryOptions()} freeFrom={freeDeliveryFrom()} demo={isDemoMode()} />;
}
