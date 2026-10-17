import { NextResponse } from 'next/server';

/**
 * Cloud imagery tiles: EUMETSAT's global infrared (10.8 µm) mosaic from the ring of
 * geostationary satellites, requested from EUMETView WMS as 256 px Web-Mercator tiles.
 * Proxied so tiles are cached at the edge for a short time instead of EUMETView's week.
 */
const WMS = 'https://view.eumetsat.int/geoserver/ows';
const LAYER = 'mumi:worldcloudmap_ir108';
const HALF = 20037508.342789244;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const z = Number(q.get('z')), x = Number(q.get('x')), y = Number(q.get('y'));
  const n = 2 ** z;
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 9 || x < 0 || y < 0 || x >= n || y >= n) {
    return NextResponse.json({ error: 'Invalid tile' }, { status: 400 });
  }
  const size = (2 * HALF) / n;
  const bbox = [-HALF + x * size, HALF - (y + 1) * size, -HALF + (x + 1) * size, HALF - y * size].map(v => v.toFixed(2)).join(',');
  const url = `${WMS}?service=WMS&version=1.3.0&request=GetMap&layers=${LAYER}&styles=&crs=EPSG:3857&bbox=${bbox}&width=256&height=256&format=image/png&transparent=true`;
  try {
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(String(res.status));
    return new NextResponse(await res.arrayBuffer(), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600, s-maxage=900, stale-while-revalidate=1800' },
    });
  } catch {
    return NextResponse.json({ error: 'Cloud imagery unavailable' }, { status: 502 });
  }
}
