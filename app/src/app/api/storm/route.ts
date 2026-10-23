import { NextResponse } from 'next/server';
import { enlilSims } from '../../../lib/feeds';
import { earthCmes, parseGeomagProbs, sScale, xrayClass, type Cme, type StormDay } from '../../../lib/storm';

/** Storm outlook (#40): NOAA SWPC forecasts and GOES measurements, and NASA DONKI's Earth-directed CMEs. */
export interface StormData {
  /** Geomagnetic storm probabilities for the next three UT days. */
  days: StormDay[];
  /** Radio blackout (R1–R2, R3+) and radiation storm (S1+) probabilities for the same days, %. */
  flareProb: { day: string; minor: number | null; major: number | null; proton: number | null }[];
  /** Current GOES 0.1–0.8 nm X-ray level. */
  xray: { t: number; flux: number; cls: string } | null;
  /** Flares in the last 24 hours by class, and the largest. */
  flares: { c: number; m: number; x: number; max: { cls: string; t: number } | null } | null;
  /** ≥10 MeV proton flux (pfu) and its S-scale level. */
  protons: { t: number; pfu: number; s: number } | null;
  /** SWPC observed sunspot number for the latest day. */
  ssn: { day: string; value: number } | null;
  /** Earth-directed CMEs, soonest first; null when DONKI couldn't be reached. */
  cmes: Cme[] | null;
}

export const revalidate = 900;

const SWPC = 'https://services.swpc.noaa.gov';
type Row = Record<string, unknown>;

async function get<T>(url: string, as: 'json' | 'text' = 'json', revalidate = 900): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (as === 'json' ? await res.json() : await res.text()) as T;
  } catch {
    return null;
  }
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(+(v as number)) ? +(v as number) : null);

export async function GET() {
  const now = Date.now();
  const [geomag, scales, xrays, flareList, protons, ssn, sims] = await Promise.all([
    get<string>(`${SWPC}/text/3-day-geomag-forecast.txt`, 'text'),
    get<Record<string, Row>>(`${SWPC}/products/noaa-scales.json`),
    get<Row[]>(`${SWPC}/json/goes/primary/xrays-6-hour.json`, 'json', 300),
    get<Row[]>(`${SWPC}/json/goes/primary/xray-flares-7-day.json`, 'json', 300),
    get<Row[]>(`${SWPC}/json/goes/primary/integral-protons-1-day.json`, 'json', 300),
    get<Row[]>(`${SWPC}/json/solar-cycle/swpc_observed_ssn.json`, 'json', 6 * 3600),
    enlilSims(),
  ]);

  const days = geomag ? parseGeomagProbs(geomag) : [];

  const flareProb = scales ? ['1', '2', '3'].flatMap(k => {
    const d = scales[k] as { DateStamp?: string; R?: Row; S?: Row } | undefined;
    return d?.DateStamp ? [{ day: d.DateStamp, minor: num(d.R?.MinorProb), major: num(d.R?.MajorProb), proton: num(d.S?.Prob) }] : [];
  }) : [];

  const long = (xrays ?? []).filter(r => r.energy === '0.1-0.8nm' && typeof r.flux === 'number');
  const lastX = long[long.length - 1];
  const xray = lastX ? { t: Date.parse(String(lastX.time_tag)), flux: lastX.flux as number, cls: xrayClass(lastX.flux as number) } : null;

  let flares: StormData['flares'] = null;
  if (flareList) {
    const recent = flareList.filter(f => typeof f.max_class === 'string' && Date.parse(String(f.max_time ?? f.time_tag)) > now - 864e5);
    const count = (c: string) => recent.filter(f => String(f.max_class).startsWith(c)).length;
    const top = recent.reduce<Row | null>((a, f) => (!a || (num(f.max_xrlong) ?? 0) > (num(a.max_xrlong) ?? 0) ? f : a), null);
    flares = { c: count('C'), m: count('M'), x: count('X'), max: top ? { cls: String(top.max_class), t: Date.parse(String(top.max_time)) } : null };
  }

  const p10 = (protons ?? []).filter(r => r.energy === '>=10 MeV' && typeof r.flux === 'number');
  const lastP = p10[p10.length - 1];
  const protonsNow = lastP ? { t: Date.parse(String(lastP.time_tag)), pfu: lastP.flux as number, s: sScale(lastP.flux as number) } : null;

  const lastSsn = ssn?.[ssn.length - 1];
  const ssnNow = lastSsn && num(lastSsn.swpc_ssn) !== null ? { day: String(lastSsn.Obsdate).slice(0, 10), value: num(lastSsn.swpc_ssn)! } : null;

  const body: StormData = { days, flareProb, xray, flares, protons: protonsNow, ssn: ssnNow, cmes: sims ? earthCmes(sims as never, now) : null };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } });
}
