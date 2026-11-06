import type { MetadataRoute } from 'next';
import { getProducts } from '@/lib/products';

const SITE_URL = process.env.SHOP_URL || 'https://ssrjkk.github.io/our-jamon';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getProducts();
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/catalog`, changeFrequency: 'daily', priority: 0.9 },
    ...products.map((p) => ({
      url: `${SITE_URL}/product/${p.id}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
