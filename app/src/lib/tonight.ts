import { DARK_ALT, moonAltitude, sunAltitude } from './astro';
import type { KpPoint } from './feeds';

/**
 * "Should I go out?" for one place over the next 12 hours. Each hour gets a 0-100 score from four
 * factors multiplied together:
 *  - aurora: how far the Kp (now, then the NOAA 3-hour forecast) clears this sky's Kp threshold;
 *    for the first two hours the live OVATION oval can raise or cap it,
 *  - darkness: none while the Sun is above -4°, full from -12° (nautical twilight),
 *  - cloud: the aurora-weighted cloud forecast (low and mid cloud in full, high at half),
 *  - Moon: a bright Moon above the horizon washes out faint aurora.
 * It is a guide, not a probability: it ranks hours and drives the verdict.
 */

export type Factor = 'aurora' | 'dark' | 'cloud' | 'moon';

export interface HourScore {
  /** Start of the hour (the first entry starts now). */
  t: number;
  score: number;
  kp: number | null;
  /** Aurora-weighted cloud, %; null when there's no forecast for the hour. */
  cloud: number | null;
  sunAlt: number;
  moonUp: boolean;
  /** Each factor, 0-1; the smallest is what holds the hour back. */
  f: Record<Factor, number>;
  /** Set when there was no Kp and no OVATION model for the hour, so its aurora chance isn't known. */
  unknown?: true;
}

export interface Inputs {
  lat: number;
  lon: number;
  /** Kp at which aurora shows low on this sky's poleward horizon. */
  need: number;
  kpNow: number | null;
  series: KpPoint[];
  /** Best OVATION probability within ~6° poleward, %. */
  ovationNearby: number | null;
  cloudNow: number | null;
  cloudHourly: { t: number; pct: number }[];
  /** Lit fraction of the Moon (changes too slowly to matter over 12 hours). */
  moonIllumination: number;
  now: number;
}

/** Aurora factor from the Kp margin over the threshold: about 0.35 at the threshold, 0.65 one step above. */
export const auroraFactor = (kp: number, need: number) => 1 / (1 + Math.exp(-1.2 * (kp - need - 0.5)));

/** The 3-hour Kp covering time t: the last forecast interval that starts at or before it. */
function kpAt(series: KpPoint[], t: number): number | null {
  let kp: number | null = null;
  for (const p of series) if (p.t <= t) kp = p.kp; else break;
  return kp;
}

const darkFactor = (alt: number) => (alt <= DARK_ALT ? 1 : alt >= -4 ? 0 : (-4 - alt) / (-4 - DARK_ALT));

export function hourlyScores(x: Inputs): HourScore[] {
  const hour = 36e5;
  const start = Math.floor(x.now / hour) * hour;
  const out: HourScore[] = [];
  for (let i = 0; i < 12; i++) {
    const t = i === 0 ? x.now : start + i * hour;
    // Sample the middle of each hour (and now, for the first).
    const at = i === 0 ? x.now : t + hour / 2;
    const kp = i === 0 && x.kpNow !== null ? x.kpNow : kpAt(x.series, at) ?? x.kpNow;
    let aurora = kp === null ? 0 : auroraFactor(kp, x.need);
    if (i <= 1 && x.ovationNearby !== null) {
      if (x.ovationNearby >= 10) aurora = Math.max(aurora, Math.min(0.95, 0.5 + x.ovationNearby / 100));
      else if (x.ovationNearby < 3) aurora = Math.min(aurora, 0.25);
    }
    const sunAlt = sunAltitude(at, x.lat, x.lon);
    const near = x.cloudHourly.reduce<{ t: number; pct: number } | null>((b, c) => (Math.abs(c.t - at) <= hour && (!b || Math.abs(c.t - at) < Math.abs(b.t - at)) ? c : b), null);
    const cloud = i === 0 && x.cloudNow !== null ? x.cloudNow : near?.pct ?? null;
    const moonUp = moonAltitude(at, x.lat, x.lon) > 0;
    const f: Record<Factor, number> = {
      aurora,
      dark: darkFactor(sunAlt),
      // Unknown cloud counts as a partial cover rather than a clear sky.
      cloud: cloud === null ? 0.7 : 1 - cloud / 100,
      moon: moonUp ? 1 - 0.35 * x.moonIllumination : 1,
    };
    const known = kp !== null || (i <= 1 && x.ovationNearby !== null);
    out.push({ t, score: Math.round(100 * f.aurora * f.dark * f.cloud * f.moon), kp, cloud, sunAlt, moonUp, f, ...(known ? {} : { unknown: true as const }) });
  }
  return out;
}

/** `unavailable`: the aurora forecast couldn't be read, so tonight's chance isn't known (not "no"). */
export type Level = 'goNow' | 'goLater' | 'maybe' | 'no' | 'unavailable';

export interface Verdict {
  level: Level;
  /** Score of the hour the verdict is about (now, or the best hour ahead). */
  score: number;
  best: HourScore;
  /** The hour `limit` describes. */
  subject: HourScore;
  /** Run of good hours around the best one; null when nothing scores 20 or more. */
  window: { from: number; to: number } | null;
  /** What holds back the hour in question, when it isn't a clear go. */
  limit: Factor | null;
  /** How high the aurora should reach in the sky at the best hour. */
  look: 'low' | 'high' | 'overhead';
}

export function verdict(hours: HourScore[], need: number): Verdict {
  const now = hours[0];
  if (hours.every(h => h.unknown)) return { level: 'unavailable', score: 0, best: now, subject: now, window: null, limit: null, look: 'low' };
  let bi = 0;
  hours.forEach((h, i) => { if (h.score > hours[bi].score) bi = i; });
  const best = hours[bi];
  let window: Verdict['window'] = null;
  if (best.score >= 20) {
    const floor = Math.max(20, best.score * 0.7);
    let a = bi, b = bi;
    while (a > 0 && hours[a - 1].score >= floor) a--;
    while (b < hours.length - 1 && hours[b + 1].score >= floor) b++;
    window = { from: hours[a].t, to: Math.floor(hours[b].t / 36e5) * 36e5 + 36e5 };
  }
  const level: Level = now.score >= 50 ? 'goNow' : best.score >= 50 ? 'goLater' : best.score >= 20 ? 'maybe' : 'no';
  // The hour the reason is about: now when it's a go, else the best hour ahead; when nothing scores
  // at all, the darkest hour, so the reason isn't just "it's daytime".
  const darkest = hours.reduce((a, b) => (b.f.dark > a.f.dark ? b : a));
  const subject = level === 'goNow' ? now : best.score > 0 ? best : darkest;
  const limit = level === 'goNow' || level === 'goLater' ? null : (Object.keys(subject.f) as Factor[]).reduce((a, b) => (subject.f[b] < subject.f[a] ? b : a));
  const margin = (best.kp ?? 0) - need;
  return { level, score: level === 'goNow' ? now.score : best.score, best, subject, window, limit, look: margin >= 3 ? 'overhead' : margin >= 1.5 ? 'high' : 'low' };
}
