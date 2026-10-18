import { NextResponse } from 'next/server';
import type { Region } from '../../../lib/sunspots';

/** NOAA SWPC active regions (updated daily); only the latest observed date is returned. */
const URL_REGIONS = 'https://services.swpc.noaa.gov/json/solar_regions.json';

export const revalidate = 3600;

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function GET() {
  try {
    const res = await fetch(URL_REGIONS, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(String(res.status));
    const rows = await res.json() as Row[];
    const latest = rows.reduce((m, r) => (String(r.observed_date) > m ? String(r.observed_date) : m), '');
    // Positions are valid at the end of the observed day (24:00 UT): NOAA's Carrington longitudes match
    // the central meridian then, and regions numbered during the day are already listed.
    const at = Date.parse(`${latest}T00:00:00Z`) + 864e5;
    const regions: Region[] = rows.filter(r => r.observed_date === latest && num(r.latitude) !== null && num(r.longitude) !== null).map(r => ({
      region: Number(r.region),
      lat: num(r.latitude)!,
      // NOAA's longitude is east-positive (S16W46 → −46); the disc maths uses west-positive.
      cmd: -num(r.longitude)!,
      at,
      spots: num(r.number_spots),
      mag: typeof r.mag_class === 'string' ? r.mag_class : null,
      mcintosh: typeof r.spot_class === 'string' ? r.spot_class : null,
      area: num(r.area),
      flare: { c: num(r.c_flare_probability), m: num(r.m_flare_probability), x: num(r.x_flare_probability) },
    })).sort((a, b) => a.region - b.region);
    return NextResponse.json({ observed: latest, regions }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } });
  } catch {
    return NextResponse.json({ error: 'Sunspot regions unavailable' }, { status: 503 });
  }
}
