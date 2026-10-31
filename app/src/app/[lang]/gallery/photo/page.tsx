import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../../i18n/server';
import { SITE } from '../../../../lib/site';
import { GalleryPhoto } from '../../../../screens/GalleryPhoto';

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** A visible gallery photo's file and caption, as anyone may see it; null if it isn't public (or can't be read). */
async function publicPhoto(id: string): Promise<{ path: string; width: number | null; height: number | null; caption: string | null } | null> {
  if (!BASE || !KEY || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const res = await fetch(`${BASE}/rest/v1/rpc/gallery_page`, {
      method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_filter: 'one', p_id: id, p_lat: null, p_lon: null, p_at: null, p_offset: 0, p_limit: 1 }),
      next: { revalidate: 300 }, signal: AbortSignal.timeout(5000),
    });
    const p = res.ok ? ((await res.json()) as { path: string; width: number | null; height: number | null; caption: string | null; status: string }[])[0] : undefined;
    return p && p.status === 'visible' ? p : null;
  } catch {
    return null;
  }
}

/** Link previews (WhatsApp, Messages, social) show the photo itself rather than the app icon. */
export async function generateMetadata({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<{ id?: string | string[] }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  const { id } = await searchParams;
  const p = typeof id === 'string' ? await publicPhoto(id) : null;
  if (!p) return { title: t('title.galleryPhoto') };
  const image = { url: `${BASE}/storage/v1/object/public/gallery/${p.path}`, ...(p.width && p.height ? { width: p.width, height: p.height } : {}) };
  return {
    title: t('title.galleryPhoto'),
    ...(p.caption ? { description: p.caption } : {}),
    openGraph: { type: 'website', siteName: SITE.name, url: `/gallery/photo?id=${id}`, images: [image] },
    twitter: { card: 'summary_large_image', images: [image.url] },
  };
}

export default function Page() {
  return <GalleryPhoto />;
}
