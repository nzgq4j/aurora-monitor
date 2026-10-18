import { NextResponse } from 'next/server';
import { listFrames } from '../../../../lib/ovalFrames';

/** Saved aurora frames for the time slider: `{ frames: [{ forecast, observed }] }`, oldest first. */
export async function GET() {
  const frames = await listFrames();
  return NextResponse.json({ frames }, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } });
}
