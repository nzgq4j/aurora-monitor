import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** The deployed build (git commit on Vercel), so open tabs and the Android app can tell when to reload. */
export function GET() {
  return NextResponse.json({ build: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' }, { headers: { 'Cache-Control': 'no-store' } });
}
