import type { KpPoint, SolarWind, WindPoint } from './feeds';
import type { I18n } from '../i18n/I18n';

/**
 * One-line summaries for the Now page's collapsible detail cards (#65). Each returns a message
 * key and its values; the thresholds are the same as the stat notes on the page.
 */
export interface Line { key: 'space.favourable' | 'space.south' | 'space.north' | 'space.quiet' | 'space.none'
  | 'outlook.peak' | 'outlook.quiet' | 'outlook.none'
  | 'solar.rising' | 'solar.falling' | 'solar.steady' | 'solar.delayed' | 'solar.none'; vars?: Record<string, string | number> }

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

/** A reading older than this means the real-time feed is behind; older than STALE_MAX, it is too old to summarise. */
export const STALE_AFTER = 20 * 6e4, STALE_MAX = 6 * 36e5;

/**
 * Solar-wind speed trend over the last 6 hours: the latest hour's mean against the mean of the hour
 * six hours before; rising or falling by 50 km/s or more, else steady. The hours are counted back from
 * the newest reading, so a gap in NOAA's real-time feed (they happen) doesn't empty the summary; when that
 * reading is over 20 minutes old the summary says when it was taken instead (`at`).
 */
export function solarLine(wind: WindPoint[], now: number): Line & { at?: number } {
  const last = [...wind].reverse().find(p => p.speed != null);
  if (!last || now - last.t > STALE_MAX) return { key: 'solar.none' };
  const end = last.t + 1;
  const mean = (from: number, to: number) => {
    const v = wind.filter(p => p.t >= from && p.t < to && p.speed != null).map(p => p.speed!);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  if (now - last.t > STALE_AFTER) return { key: 'solar.delayed', vars: { speed: Math.round(last.speed!) }, at: last.t };
  const recent = mean(end - 36e5, end)!, before = mean(end - 7 * 36e5, end - 6 * 36e5);
  if (before == null) return { key: 'solar.steady', vars: { speed: Math.round(recent) } };
  const d = recent - before;
  const vars = { from: Math.round(before), to: Math.round(recent), speed: Math.round(recent) };
  return d >= 50 ? { key: 'solar.rising', vars } : d <= -50 ? { key: 'solar.falling', vars } : { key: 'solar.steady', vars };
}

/** A card summary's message (`detail.{key}`), numbers in the page's format, with an optional formatted day. */
export function summaryText({ t, num }: Pick<I18n, 't' | 'num'>, line: Line, day?: string, time?: string) {
  const vars = Object.fromEntries(Object.entries(line.vars ?? {}).map(([k, v]) => [k, typeof v === 'number' ? num(v, Number.isInteger(v) ? 0 : 1) : v]));
  return t(`detail.${line.key}`, { ...vars, ...(day ? { day } : {}), ...(time ? { time } : {}) });
}
