import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { siteUrl } from '@/lib/config';

// Роботы отдаются по запросу, как sitemap: без connection() Next снимает файл на сборке,
// когда SHOP_URL ещё не известен. Тогда в боевой контейнер ложится собранный адрес
// GitHub Pages, и production-сайт сам указывает поисковику на демо-хост.
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/cart', '/order/', '/api/'],
    },
    sitemap: siteUrl('/sitemap.xml'),
  };
}
