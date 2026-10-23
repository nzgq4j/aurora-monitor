import { hemiPower, kpNow, kpSeries, outlook27, ovalEdge, ovalPoints, ovation, solarWind, type KpPoint, type OutlookDay, type SolarWind } from './feeds';

export interface NowData {
  kp: { t: number; kp: number } | null;
  /** 3-hour Kp from two UTC days ago through the end of the NOAA 3-day forecast. */
  series: KpPoint[];
  /** NOAA 27-day outlook (largest daily Kp). */
  outlook: OutlookDay[];
  wind: SolarWind | null;
  hemi: { t: number; north: number } | null;
  oval: { points: [number, number, number][]; edge: [number, number][][]; observed: number | null; forecast: number | null } | null;
  fetchedAt: number;
}

/** The time a server render runs (cached pages keep it, so the browser can tell how old they are). */
export const renderedAt = () => Date.now();

export async function loadNow(): Promise<NowData> {
  const [kp, series, wind, hemi, oval, outlook] = await Promise.all([kpNow(), kpSeries(), solarWind(), hemiPower(), ovation(), outlook27()]);
  const from = Math.floor(Date.now() / 864e5) * 864e5 - 2 * 864e5;
  let shown = series.filter(p => p.t >= from);
  // Drop a final UTC day that holds only a stray value or two past the 3-day forecast.
  if (shown.length) {
    const lastDay = Math.floor(shown[shown.length - 1].t / 864e5) * 864e5;
    if (shown.filter(p => p.t >= lastDay).length < 4) shown = shown.filter(p => p.t < lastDay);
  }
  return {
    kp: kp ?? [...series].reverse().find(p => p.kind !== 'predicted') ?? null,
    series: shown,
    outlook,
    wind, hemi,
    oval: oval ? { points: ovalPoints(oval), edge: ovalEdge(oval), observed: oval.observed, forecast: oval.forecast } : null,
    fetchedAt: Date.now(),
  };
}
