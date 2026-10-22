/**
 * Storm outlook (#40): NOAA SWPC's 3-day geomagnetic storm probabilities, solar flares and X-ray flux,
 * proton flux, the sunspot number and Earth-directed CMEs (NASA DONKI WSA-Enlil), with the levels the
 * Now page shows. Thresholds follow SWPC's own wording and scales, noted at each one.
 */

/** NOAA's probabilities for one UT day, %: Active (Kp 4), Minor (G1), Moderate (G2), Strong–Extreme (G3+). */
export interface StormDay { day: string; active: number; minor: number; moderate: number; strong: number }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The "NOAA Geomagnetic Activity Probabilities" block of SWPC's 3-day-geomag-forecast.txt, e.g.
 *   :Issued: 2026 Oct 18 2205 UTC … Probabilities 19 Oct-21 Oct / Active 35/30/40 / Minor storm 40/40/25 …
 */
export function parseGeomagProbs(text: string): StormDay[] {
  const issued = text.match(/:Issued:\s*(\d{4})\s+(\w{3})\s+(\d{1,2})/);
  const range = text.match(/Activity Probabilities\s+(\d{1,2})\s+(\w{3})/);
  if (!issued || !range) return [];
  const month = MONTHS.indexOf(range[2]);
  if (month < 0) return [];
  // The forecast starts the day after it's issued, so late December issues run into January.
  const year = +issued[1] + (MONTHS.indexOf(issued[2]) === 11 && month === 0 ? 1 : 0);
  const row = (label: string) => text.match(new RegExp(`^${label}\\s+(\\d+)/(\\d+)/(\\d+)`, 'm'))?.slice(1, 4).map(Number) ?? null;
  const active = row('Active'), minor = row('Minor storm'), moderate = row('Moderate storm'), strong = row('Strong-Extreme storm');
  if (!active || !minor || !moderate || !strong) return [];
  const start = Date.UTC(year, month, +range[1]);
  return [0, 1, 2].map(i => ({
    day: new Date(start + i * 864e5).toISOString().slice(0, 10),
    active: active[i], minor: minor[i], moderate: moderate[i], strong: strong[i],
  }));
}

export type StormLevel = 'quiet' | 'active' | 'minor' | 'moderate' | 'strong';
/** A level counts as "likely" from this probability (%); below it on every day, the outlook is quiet. */
export const LIKELY = 25;

/** The most severe level with at least LIKELY % on any of the three days, its day and probability. */
export function stormHeadline(days: StormDay[]): { level: StormLevel; day: string | null; prob: number } {
  for (const level of ['strong', 'moderate', 'minor', 'active'] as const) {
    const best = days.reduce<StormDay | null>((a, d) => (d[level] >= LIKELY && (!a || d[level] > a[level]) ? d : a), null);
    if (best) return { level, day: best.day, prob: best[level] };
  }
  return { level: 'quiet', day: null, prob: 0 };
}

/**
 * GOES 0.1–0.8 nm X-ray flux (W/m²) as a flare class, e.g. 8.3e-7 → "B8.3", 2.1e-5 → "M2.1". Rounded down to
 * a tenth; the tiny epsilon stops floating-point error turning 3e-4 into "X2.9".
 */
export function xrayClass(flux: number): string {
  const classes = [['X', 1e-4], ['M', 1e-5], ['C', 1e-6], ['B', 1e-7], ['A', 1e-8]] as const;
  for (const [c, base] of classes) if (flux >= base) return `${c}${(Math.floor((flux / base) * 10 + 1e-9) / 10).toFixed(1)}`;
  return 'A0.0';
}

/** Flux (W/m²) of a class string such as "M2.1". */
export function classFlux(cls: string): number {
  const base = { A: 1e-8, B: 1e-7, C: 1e-6, M: 1e-5, X: 1e-4 }[cls[0] as 'A'] ?? 0;
  return base * (parseFloat(cls.slice(1)) || 1);
}

export type SolarLevel = 'veryLow' | 'low' | 'moderate' | 'high';
/**
 * Solar activity from the largest flare in the last 24 hours, as SWPC words it: very low below C class,
 * low for C, moderate for M1–M4, high from M5 (and X).
 */
export function solarLevel(maxFlux: number | null): SolarLevel {
  if (maxFlux === null || maxFlux < 1e-6) return 'veryLow';
  if (maxFlux < 1e-5) return 'low';
  return maxFlux < 5e-5 ? 'moderate' : 'high';
}

/** NOAA S-scale (solar radiation storm) from ≥10 MeV proton flux, pfu: S1 at 10, S2 100, … S5 100 000. */
export const sScale = (pfu: number) => (pfu >= 1e5 ? 5 : pfu >= 1e4 ? 4 : pfu >= 1e3 ? 3 : pfu >= 100 ? 2 : pfu >= 10 ? 1 : 0);

/** An Earth-directed CME forecast by NASA's WSA-Enlil model. */
export interface Cme { arrival: number; glancing: boolean; kpLow: number | null; kpHigh: number | null; link: string | null }

interface EnlilSim {
  modelCompletionTime?: string; estimatedShockArrivalTime?: string | null; isEarthGB?: boolean;
  kp_18?: number | null; kp_90?: number | null; kp_135?: number | null; kp_180?: number | null;
  link?: string; cmeIDs?: string[];
}

/** DONKI times look like "2026-10-20T14:00Z". */
const donkiTime = (s: string | null | undefined) => (s ? Date.parse(s.endsWith('Z') ? s : `${s}Z`) : NaN);

/**
 * CMEs forecast to reach Earth from 12 hours ago on: one per CME (the latest model run wins), soonest
 * first. The Kp range spans the model's estimates for different magnetic field orientations.
 */
export function earthCmes(sims: EnlilSim[], now: number): Cme[] {
  const byCme = new Map<string, EnlilSim>();
  for (const s of sims) {
    const arrival = donkiTime(s.estimatedShockArrivalTime);
    if (!Number.isFinite(arrival) || arrival < now - 12 * 36e5) continue;
    const key = (s.cmeIDs ?? []).join(',') || String(arrival);
    const prev = byCme.get(key);
    if (!prev || donkiTime(s.modelCompletionTime) > donkiTime(prev.modelCompletionTime)) byCme.set(key, s);
  }
  return [...byCme.values()].map(s => {
    const kps = [s.kp_18, s.kp_90, s.kp_135, s.kp_180].filter((k): k is number => typeof k === 'number');
    return {
      arrival: donkiTime(s.estimatedShockArrivalTime), glancing: !!s.isEarthGB,
      kpLow: kps.length ? Math.min(...kps) : null, kpHigh: kps.length ? Math.max(...kps) : null, link: s.link ?? null,
    };
  }).sort((a, b) => a.arrival - b.arrival);
}

/**
 * How far from the pole aurora can be seen at a Kp: low on the poleward horizon down to about
 * 63° − 2·Kp magnetic latitude (the rule lib/astro's kpNeeded uses).
 */
export const reachMagLat = (kp: number) => Math.round(63 - 2 * kp);
