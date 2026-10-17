// TEMPORARY: inspect satellite cloud services from Vercel's network. Not merged.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function get(url: string, keepBody = false) {
  try {
    const r = await fetch(url, { cache: 'no-store', headers: { Origin: 'https://aurora-monitor.vercel.app' } });
    const buf = Buffer.from(await r.arrayBuffer());
    return { url, status: r.status, type: r.headers.get('content-type'), acao: r.headers.get('access-control-allow-origin'), cache: r.headers.get('cache-control'), bytes: buf.length, body: keepBody ? (/image/.test(r.headers.get('content-type') ?? '') ? buf.toString('base64') : buf.toString('utf8').slice(0, 400)) : undefined };
  } catch (e) { return { url, error: String(e) }; }
}

export async function GET() {
  const capsRes = await fetch('https://view.eumetsat.int/geoserver/ows?service=WMS&version=1.3.0&request=GetCapabilities', { cache: 'no-store' }).then(r => r.text()).catch(e => 'ERR ' + e);
  const layers = [...capsRes.matchAll(/<Layer[^>]*>\s*<Name>([^<]+)<\/Name>\s*<Title>([^<]*)<\/Title>[\s\S]*?(?:<Dimension name="time"[^>]*default="([^"]*)")?/g)]
    .map(m => ({ name: m[1], title: m[2], timeDefault: m[3] }))
    .filter(l => /world|cloud|ir108|ir_108|ir10|global/i.test(l.name + ' ' + l.title));
  const bbox = '-20037508,0,0,20037508'; // NW quadrant in EPSG:3857
  const wms = (layer: string) => `https://view.eumetsat.int/geoserver/ows?service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&crs=EPSG:3857&bbox=${bbox}&width=256&height=256&format=image/png&transparent=true`;
  const tests = await Promise.all([
    get(wms('mumi:worldcloudmap_ir108'), true),
    get('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/2/1/1.png'),
  ]);
  return NextResponse.json({ capsBytes: capsRes.length, capsHead: capsRes.slice(0, 200), layers: layers.slice(0, 40), tests });
}
