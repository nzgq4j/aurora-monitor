import type { KpPoint, SolarWind, WindPoint } from './feeds';

/**
 * One-line summaries for the Now page's collapsible detail cards (#65). Each returns a message
 * key and its values; the thresholds are the same as the stat notes on the page.
 */
export interface Line { key: 'space.favourable' | 'space.south' | 'space.north' | 'space.quiet' | 'space.none'
  | 'outlook.peak' | 'outlook.quiet' | 'outlook.none'
  | 'solar.rising' | 'solar.falling' | 'solar.steady' | 'solar.none'; vars?: Record<string, string | number> }

/** Bz south (≤ −3 nT) drives aurora, north (≥ 3 nT) holds it back; fast wind is ≥ 450 km/s. */
export const BZ_SOUTH = -3, BZ_NORTH = 3, FAST = 450;

export function spaceLine(w: SolarWind | null): Line {
  if (!w || w.bz == null) return { key: 'space.none' };
  const bz = Math.round(w.bz * 10) / 10;
  if (w.bz <= BZ_SOUTH && (w.speed ?? 0) >= FAST) return { key: 'space.favourable', vars: { bz, speed: Math.round(w.speed!) } };
  if (w.bz <= BZ_SOUTH) return { key: 'space.south', vars: { bz } };
  if (w.bz >= BZ_NORTH) return { key: 'space.north', vars: { bz } };
  return { key: 'space.quiet' };
}

/** The highest forecast Kp from now on, and when; quiet when it stays below Kp 4. */
export function outlookLine(series: KpPoint[], now: number): Line & { at?: number } {
  const ahead = series.filter(p => p.kind === 'predicted' && p.t + 3 * 36e5 > now);
  if (!ahead.length) return { key: 'outlook.none' };
  const peak = ahead.reduce((a, b) => (b.kp > a.kp ? b : a));
  const kp = Math.round(peak.kp * 10) / 10;
  return peak.kp >= 4 ? { key: 'outlook.peak', vars: { kp }, at: peak.t } : { key: 'outlook.quiet', vars: { kp } };
}

/**
 * Solar-wind speed trend over the last 6 hours: the last hour's mean against the mean of the hour
 * six hours ago; rising or falling by 50 km/s or more, else steady.
 */
export function solarLine(wind: WindPoint[], now: number): Line {
  const mean = (from: number, to: number) => {
    const v = wind.filter(p => p.t >= from && p.t < to && p.speed != null).map(p => p.speed!);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const recent = mean(now - 36e5, now + 1), before = mean(now - 7 * 36e5, now - 6 * 36e5);
  if (recent == null) return { key: 'solar.none' };
  if (before == null) return { key: 'solar.steady', vars: { speed: Math.round(recent) } };
  const d = recent - before;
  const vars = { from: Math.round(before), to: Math.round(recent), speed: Math.round(recent) };
  return d >= 50 ? { key: 'solar.rising', vars } : d <= -50 ? { key: 'solar.falling', vars } : { key: 'solar.steady', vars };
}
