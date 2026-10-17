import { NextResponse, type NextRequest } from 'next/server';
import { darkness, kpNeeded, magLat, sunAltitude } from '../../../lib/astro';
import { ovalAt, ovation } from '../../../lib/feeds';

export interface CloudLayers { low: number; mid: number; high: number }

export interface Conditions {
  lat: number;
  lon: number;
  /** OVATION probability overhead, and the best value within ~6° poleward (visible low on the horizon). */
  aurora: { overhead: number; nearby: number; forecastAt: number | null } | null;
  /**
   * Forecast cloud now (Open-Meteo), %. `aurora` is what matters for seeing it: low and mid cloud
   * count in full, high (often thin cirrus the aurora shows through) at half weight. Hourly values
   * for the next 12 hours use the same weighting.
   */
  cloud: { now: number; aurora: number; layers: CloudLayers; next12h: { t: number; pct: number }[] } | null;
  /** Observed cloud from the EUMETSAT infrared satellite mosaic (updated hourly), %. */
  satellite: { pct: number } | null;
  sun: { altitude: number; dark: boolean; changesAt: number | null };
  magLat: number;
  kpNeeded: number;
}

/** Layers combined as independent coverings, with high cloud at half weight; never above the total. */
const auroraCloud = (total: number, { low, mid, high }: CloudLayers) =>
  Math.round(Math.min(total, 100 * (1 - (1 - low / 100) * (1 - mid / 100) * (1 - high / 200))));

async function cloudCover(lat: number, lon: number): Promise<Conditions['cloud']> {
  const vars = 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=${vars}&hourly=${vars}&forecast_hours=12&timezone=GMT`;
  try {
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    const j = await res.json();
    const c = j?.current ?? {};
    if (![c.cloud_cover, c.cloud_cover_low, c.cloud_cover_mid, c.cloud_cover_high].every(v => typeof v === 'number')) return null;
    const layers = { low: c.cloud_cover_low, mid: c.cloud_cover_mid, high: c.cloud_cover_high };
    const h = j?.hourly ?? {};
    const next12h = ((h.time ?? []) as string[]).map((t, i) => ({
      t: Date.parse(t + 'Z'),
      pct: auroraCloud(h.cloud_cover?.[i], { low: h.cloud_cover_low?.[i], mid: h.cloud_cover_mid?.[i], high: h.cloud_cover_high?.[i] }),
    })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.pct));
    return { now: c.cloud_cover, aurora: auroraCloud(c.cloud_cover, layers), layers, next12h };
  } catch {
    return null;
  }
}

// The same infrared mosaic as the map's Clouds layer, read at a point (GetFeatureInfo gives the grey level).
const WMS = 'https://view.eumetsat.int/geoserver/ows?service=WMS&version=1.3.0&request=GetFeatureInfo&layers=mumi:worldcloudmap_ir108&query_layers=mumi:worldcloudmap_ir108&styles=&crs=EPSG:4326&width=3&height=3&i=1&j=1&info_format=application/json';
/** Grey levels read as clear (≤ LO) and solid cloud (≥ HI); matches the map's cloud rendering. */
const GREY_LO = 105, GREY_HI = 205;

async function greyAt(lat: number, lon: number): Promise<number | null> {
  const d = 0.02;
  try {
    const res = await fetch(`${WMS}&bbox=${(lat - d).toFixed(3)},${(lon - d).toFixed(3)},${(lat + d).toFixed(3)},${(lon + d).toFixed(3)}`, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    const g = (await res.json())?.features?.[0]?.properties?.GRAY_INDEX;
    return typeof g === 'number' ? g : null;
  } catch {
    return null;
  }
}

/** Satellite cloud at and around a point (centre plus four neighbours ~10 km away), averaged. */
async function satelliteCloud(lat: number, lon: number): Promise<Conditions['satellite']> {
  const dLat = 0.09, dLon = 0.09 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const points: [number, number][] = [[lat, lon], [lat + dLat, lon], [lat - dLat, lon], [lat, lon + dLon], [lat, lon - dLon]];
  const greys = (await Promise.all(points.map(([a, o]) => greyAt(Math.max(-89, Math.min(89, a)), ((o + 540) % 360) - 180)))).filter((g): g is number => g !== null);
  if (!greys.length) return null;
  const cover = greys.map(g => { const t = Math.max(0, Math.min(1, (g - GREY_LO) / (GREY_HI - GREY_LO))); return t * t * (3 - 2 * t); });
  return { pct: Math.round((100 * cover.reduce((a, b) => a + b, 0)) / cover.length) };
}

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lon = Number(req.nextUrl.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 });
  }
  const now = Date.now();
  const [oval, cloud, satellite] = await Promise.all([ovation(), cloudCover(lat, lon), satelliteCloud(lat, lon)]);
  const body: Conditions = {
    lat, lon,
    aurora: oval ? { ...ovalAt(oval, lat, lon), forecastAt: oval.forecast } : null,
    cloud,
    satellite,
    sun: { altitude: Math.round(sunAltitude(now, lat, lon) * 10) / 10, ...darkness(now, lat, lon) },
    magLat: Math.round(magLat(lat, lon) * 10) / 10,
    kpNeeded: kpNeeded(lat, lon),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
}
