import type { MetadataRoute } from 'next';
import { LOCALES } from '../i18n/config';
import { SITE } from '../lib/site';
import { allPaths, liveSections } from '../lib/support';

/** Public pages, each with its address in every language (/de/map and so on) as alternates. */
const PAGES = ['', '/map', '/sun', '/gallery', '/sky', '/plans', '/privacy', '/terms', '/delete-account'];

export default function sitemap(): MetadataRoute.Sitemap {
  const support = ['/support', ...liveSections('en').map(s => `/support/${s}`), ...allPaths().map(p => `/support/${p.section}/${p.slug}`)];
  return [...PAGES, ...support].map(path => ({
    url: `${SITE.url}${path || '/'}`,
    alternates: { languages: Object.fromEntries(LOCALES.map(l => [l, `${SITE.url}/${l}${path}`])) },
  }));
}
