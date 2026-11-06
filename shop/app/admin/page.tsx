import type { Metadata } from 'next';
import AdminClient from '@/components/AdminClient';

export const metadata: Metadata = {
  title: 'Админка — заказы',
  robots: { index: false },
};

export default function AdminPage() {
  return <AdminClient />;
}
