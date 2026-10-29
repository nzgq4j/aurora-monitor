import type { MetadataRoute } from 'next';
import { SITE } from '../lib/site';

/** Everything public may be indexed except the API and account pages; points crawlers at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard', '/checkout', '/signin', '/reset-password', '/gallery/moderate'] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
