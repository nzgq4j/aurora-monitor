import type { MetadataRoute } from 'next';
import { SITE } from '../lib/site';

/** Web app manifest: makes Polar Lights installable and is the source for the Android (Trusted Web Activity) build. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: `${SITE.name} · ${SITE.tagline}`,
    short_name: SITE.name,
    description: 'Live aurora forecasts, the auroral oval, cloud cover and alerts for your sky.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#000000',
    theme_color: '#000000',
    lang: 'en',
    dir: 'ltr',
    categories: ['weather', 'education', 'travel'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
    ],
    shortcuts: [
      { name: 'Aurora now', short_name: 'Now', url: '/?source=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Aurora map', short_name: 'Map', url: '/map?source=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Account & alerts', short_name: 'Account', url: '/account?source=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
    screenshots: [
      { src: '/screenshots/now-narrow.png', sizes: '1080x2340', type: 'image/png', form_factor: 'narrow', label: 'Live aurora conditions for your sky' },
      { src: '/screenshots/map-narrow.png', sizes: '1080x2340', type: 'image/png', form_factor: 'narrow', label: 'Zoomable aurora probability map' },
      { src: '/screenshots/now-wide.png', sizes: '1920x1080', type: 'image/png', form_factor: 'wide', label: 'Aurora conditions and outlook' },
    ],
    prefer_related_applications: false,
  };
}
