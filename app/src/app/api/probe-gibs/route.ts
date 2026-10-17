// TEMPORARY: inspect NASA GIBS availability from Vercel's network. Not merged.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function tile(url: string) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const buf = Buffer.from(await r.arrayBuffer());
    return { url, status: r.status, type: r.headers.get('content-type'), bytes: buf.length, b64: r.ok && buf.length < 400000 ? buf.toString('base64') : buf.toString('utf8').slice(0, 300) };
  } catch (e) { return { url, error: String(e) }; }
}

export async function GET() {
  const caps = await fetch('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml', { cache: 'no-store' }).then(r => r.text()).catch(e => 'ERR ' + e);
  const ids = [...caps.matchAll(/<ows:Identifier>([^<]+)<\/ows:Identifier>/g)].map(m => m[1]);
  const geo = ids.filter(id => /MSG|Meteosat|SEVIRI|Band13|Clean_Infrared|GEO_|Geostationary|Global_IR|IR_Cloud|Brightness_Temp/i.test(id));
  const base = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
  const tests = await Promise.all([
    tile(`${base}/GOES-East_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/2/1/1.png`),
    tile(`${base}/GOES-East_ABI_Band13_Clean_Infrared/default/2026-10-17T06:00:00Z/GoogleMapsCompatible_Level6/2/1/1.png`),
  ]);
  return NextResponse.json({ geo: [...new Set(geo)], tests });
}
