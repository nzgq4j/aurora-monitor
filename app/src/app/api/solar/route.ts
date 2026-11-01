import { NextResponse } from 'next/server';
import { hemiPowerSeries, solarWindSeries, type HemiPoint, type WindPoint } from '../../../lib/feeds';

export interface SolarActivity { wind: WindPoint[]; hemi: HemiPoint[] }

// Run on every request and let the CDN cache the response (its Cache-Control): as a revalidated (ISR)
// route Vercel kept serving the copy made at deploy time and never stored a fresh one, so the data froze.
export const dynamic = 'force-dynamic';

export async function GET() {
  const [wind, hemi] = await Promise.all([solarWindSeries(), hemiPowerSeries()]);
  const body: SolarActivity = { wind, hemi };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } });
}
