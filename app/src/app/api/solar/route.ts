import { NextResponse } from 'next/server';
import { hemiPowerSeries, solarWindSeries, type HemiPoint, type WindPoint } from '../../../lib/feeds';

export interface SolarActivity { wind: WindPoint[]; hemi: HemiPoint[] }

export const revalidate = 120;

export async function GET() {
  const [wind, hemi] = await Promise.all([solarWindSeries(), hemiPowerSeries()]);
  const body: SolarActivity = { wind, hemi };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } });
}
