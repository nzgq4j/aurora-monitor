import { NextResponse } from 'next/server';
import { ovalGridBase64, ovation } from '../../../lib/feeds';
import { getFrame } from '../../../lib/ovalFrames';

export interface OvalGrid {
  observed: number | null;
  forecast: number | null;
  /** Probability 0–100 as base64 bytes, 181 rows (lat −90..90) × 360 columns (lon 0..359 east). */
  data: string;
}

export const revalidate = 120;

export async function GET(req: Request) {
  // ?t=<forecast time, ms>: a saved frame for the time slider; past frames never change.
  const t = new URL(req.url).searchParams.get('t');
  if (t) {
    const frame = await getFrame(Number(t));
    if (!frame) return NextResponse.json({ error: 'No saved frame for that time' }, { status: 404 });
    return NextResponse.json(frame satisfies OvalGrid, { headers: { 'Cache-Control': 'public, s-maxage=86400, immutable' } });
  }
  const oval = await ovation();
  if (!oval) return NextResponse.json({ error: 'OVATION data unavailable' }, { status: 503 });
  const body: OvalGrid = { observed: oval.observed, forecast: oval.forecast, data: ovalGridBase64(oval) };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } });
}
