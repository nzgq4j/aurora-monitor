// TEMPORARY: inspect NASA GIBS availability from Vercel's network. Not merged.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function head(url: string) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const buf = new Uint8Array(await r.arrayBuffer());
    return { url, status: r.status, type: r.headers.get('content-type'), bytes: buf.length, magic: Array.from(buf.slice(0, 4)).map(b => b.toString(16)).join(' ') };
  } catch (e) { return { url, error: String(e) }; }
}

export async function GET() {
  const caps = await fetch('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml', { cache: 'no-store' }).then(r => r.text()).catch(e => 'ERR ' + e);
  const layers = [...caps.matchAll(/<Layer>[\s\S]*?<ows:Identifier>([^<]+)<\/ows:Identifier>[\s\S]*?<\/Layer>/g)].map(m => m[0]);
  const pick = layers.filter(l => /Infrared|Cloud|IR|Band13|Clean_Longwave|Geocolor|GeoColor/i.test(l.match(/<ows:Identifier>([^<]+)</)?.[1] ?? ''));
  const summary = pick.map(l => ({
    id: l.match(/<ows:Identifier>([^<]+)</)?.[1],
    formats: [...l.matchAll(/<Format>([^<]+)</g)].map(m => m[1]),
    matrix: [...l.matchAll(/<TileMatrixSet>([^<]+)</g)].map(m => m[1]),
    timeDefault: l.match(/<Default>([^<]+)<\/Default>/)?.[1],
    timeValue: (l.match(/<Value>([^<]+)<\/Value>/)?.[1] ?? '').slice(0, 80),
    template: l.match(/template="([^"]+)"/)?.[1],
  }));
  const tests = await Promise.all([
    head('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level7/3/2/2.png'),
    head('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-West_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level7/3/2/1.png'),
    head('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Himawari_AHI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level7/3/2/6.png'),
  ]);
  return NextResponse.json({ capsBytes: caps.length, totalLayers: layers.length, matches: summary, tests });
}
