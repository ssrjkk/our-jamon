import type { MetadataRoute } from 'next';
import { getProducts } from '@/lib/products';
import { siteUrl } from '@/lib/config';
import { connection } from 'next/server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const products = await getProducts();
  return [
    { url: siteUrl(), changeFrequency: 'weekly', priority: 1 },
    { url: siteUrl('/catalog'), changeFrequency: 'daily', priority: 0.9 },
    { url: siteUrl('/about'), changeFrequency: 'monthly', priority: 0.4 },
    ...products.map((p) => ({
      url: siteUrl(`/product/${p.id}`),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
