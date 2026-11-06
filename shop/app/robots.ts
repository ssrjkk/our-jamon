import type { MetadataRoute } from 'next';

const SITE_URL = process.env.SHOP_URL || 'https://ssrjkk.github.io/our-jamon';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/cart', '/order/', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
