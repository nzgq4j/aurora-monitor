import { NextResponse, type NextRequest } from 'next/server';
import { darkness, kpNeeded, magLat, sunAltitude } from '../../../lib/astro';
import { ovalAt, ovation } from '../../../lib/feeds';

export interface Conditions {
  lat: number;
  lon: number;
  /** OVATION probability overhead, and the best value within ~6° poleward (visible low on the horizon). */
  aurora: { overhead: number; nearby: number; forecastAt: number | null } | null;
  /** Total cloud cover now, %, and the hourly forecast for the next 12 hours. */
  cloud: { now: number; next12h: { t: number; pct: number }[] } | null;
  sun: { altitude: number; dark: boolean; changesAt: number | null };
  magLat: number;
  kpNeeded: number;
}

async function cloudCover(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=cloud_cover&hourly=cloud_cover&forecast_hours=12&timezone=GMT`;
  try {
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    const j = await res.json();
    const now = typeof j?.current?.cloud_cover === 'number' ? j.current.cloud_cover : null;
    const times: string[] = j?.hourly?.time ?? [];
    const pcts: number[] = j?.hourly?.cloud_cover ?? [];
    if (now === null) return null;
    return { now, next12h: times.map((t, i) => ({ t: Date.parse(t + 'Z'), pct: pcts[i] })).filter(x => Number.isFinite(x.t) && typeof x.pct === 'number') };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lon = Number(req.nextUrl.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 });
  }
  const now = Date.now();
  const [oval, cloud] = await Promise.all([ovation(), cloudCover(lat, lon)]);
  const body: Conditions = {
    lat, lon,
    aurora: oval ? { ...ovalAt(oval, lat, lon), forecastAt: oval.forecast } : null,
    cloud,
    sun: { altitude: Math.round(sunAltitude(now, lat, lon) * 10) / 10, ...darkness(now, lat, lon) },
    magLat: Math.round(magLat(lat, lon) * 10) / 10,
    kpNeeded: kpNeeded(lat, lon),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
}
