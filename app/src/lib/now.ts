import { hemiPower, kpNow, kpSeries, ovalEdge, ovalPoints, ovation, solarWind, type KpPoint, type SolarWind } from './feeds';

export interface NowData {
  kp: { t: number; kp: number } | null;
  /** 3-hour Kp from two UTC days ago through the end of the NOAA 3-day forecast. */
  series: KpPoint[];
  wind: SolarWind | null;
  hemi: { t: number; north: number } | null;
  oval: { points: [number, number, number][]; edge: [number, number][]; observed: number | null; forecast: number | null } | null;
  fetchedAt: number;
}

export async function loadNow(): Promise<NowData> {
  const [kp, series, wind, hemi, oval] = await Promise.all([kpNow(), kpSeries(), solarWind(), hemiPower(), ovation()]);
  const from = Math.floor(Date.now() / 864e5) * 864e5 - 2 * 864e5;
  return {
    kp: kp ?? [...series].reverse().find(p => p.kind !== 'predicted') ?? null,
    series: series.filter(p => p.t >= from),
    wind, hemi,
    oval: oval ? { points: ovalPoints(oval), edge: ovalEdge(oval), observed: oval.observed, forecast: oval.forecast } : null,
    fetchedAt: Date.now(),
  };
}
