import { NextResponse, type NextRequest } from 'next/server';
import { darkness, kpNeeded, magLat, sunAltitude } from '../../../lib/astro';
import { ovalAt, ovation } from '../../../lib/feeds';
import { CLOUD_HI, CLOUD_LO } from '../../../lib/cloudify';
import { cloudCover, type CloudForecast } from '../../../lib/cloud';

export type { CloudLayers } from '../../../lib/cloud';

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
  cloud: CloudForecast | null;
  /** Observed cloud from the EUMETSAT infrared satellite mosaic (updated hourly), %. */
  satellite: { pct: number } | null;
  sun: { altitude: number; dark: boolean; changesAt: number | null };
  magLat: number;
  kpNeeded: number;
}

// The same infrared mosaic as the map's Clouds layer, read at a point (GetFeatureInfo gives the grey level).
const WMS = 'https://view.eumetsat.int/geoserver/ows?service=WMS&version=1.3.0&request=GetFeatureInfo&layers=mumi:worldcloudmap_ir108&query_layers=mumi:worldcloudmap_ir108&styles=&crs=EPSG:4326&width=3&height=3&i=1&j=1&info_format=application/json';

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
  const cover = greys.map(g => { const t = Math.max(0, Math.min(1, (g - CLOUD_LO) / (CLOUD_HI - CLOUD_LO))); return t * t * (3 - 2 * t); });
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
