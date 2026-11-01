/**
 * NASA SDO's latest HMI intensitygram (visible-light sunspots, public domain), served from our own
 * origin so the page can read its pixels to find the solar disc for the region labels.
 */
const IMAGE = 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIIC.jpg';

// Run on every request and let the CDN cache the response (its Cache-Control): as a revalidated (ISR)
// route Vercel kept serving the copy made at deploy time and never stored a fresh one, so the data froze.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(IMAGE, { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(String(res.status));
    return new Response(await res.arrayBuffer(), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } });
  } catch {
    return new Response('Image unavailable', { status: 503 });
  }
}
