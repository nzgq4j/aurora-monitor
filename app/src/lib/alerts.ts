import type { HourScore } from './tonight';

/** How strong the aurora has to be before an alert: the hour's chance score (lib/tonight) at least this. */
export type AlertLevel = 'faint' | 'visible' | 'clear';
export const LEVEL_SCORE: Record<AlertLevel, number> = { faint: 20, visible: 45, clear: 70 };
export const ALERT_LEVELS: AlertLevel[] = ['faint', 'visible', 'clear'];

/**
 * The Kp at which a place needing Kp `need` reaches `level` on a clear, dark, moonless night: where
 * lib/tonight's aurora factor, 1 / (1 + e^(−1.2·(Kp − need − 0.5))), equals the level's score.
 * Faint ≈ need − 0.7, visible ≈ need + 0.3, clear ≈ need + 1.2.
 */
export const levelKp = (level: AlertLevel, need: number) => {
  const p = LEVEL_SCORE[level] / 100;
  // Places in the auroral zone need Kp 0, where any day counts.
  return Math.max(0, need + 0.5 - Math.log(1 / p - 1) / 1.2);
};

/** A user's alert rules, stored as alert_settings.rules (jsonb). */
export interface AlertRules {
  /** Alert when aurora reaches `level` at the user's locations. */
  aurora: boolean;
  level: AlertLevel;
  /** Heads-up when it's expected to reach `level` within the hour (Chaser). */
  forecast: boolean;
  /** Major-storm alert when Kp reaches the storm Kp; sent even during quiet hours. */
  storm: boolean;
  /** Pause aurora and heads-up alerts between quietFrom and quietTo (local 'HH:MM'). */
  quiet: boolean;
  quietFrom: string;
  quietTo: string;
}

export const DEFAULT_RULES: AlertRules = { aurora: true, level: 'visible', forecast: true, storm: true, quiet: false, quietFrom: '23:00', quietTo: '07:00' };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Saved rules as the engine can use them. alert_settings.rules is written by the user's own browser, so
 * anything of the wrong type (a number for a time, an unknown level) falls back to the default instead of
 * reaching the engine.
 */
export function normalizeRules(raw: unknown): AlertRules {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const flag = (k: 'aurora' | 'forecast' | 'storm' | 'quiet') => (typeof r[k] === 'boolean' ? r[k] as boolean : DEFAULT_RULES[k]);
  const time = (k: 'quietFrom' | 'quietTo') => (typeof r[k] === 'string' && HHMM.test(r[k] as string) ? r[k] as string : DEFAULT_RULES[k]);
  return {
    aurora: flag('aurora'), forecast: flag('forecast'), storm: flag('storm'), quiet: flag('quiet'),
    level: ALERT_LEVELS.includes(r.level as AlertLevel) ? r.level as AlertLevel : DEFAULT_RULES.level,
    quietFrom: time('quietFrom'), quietTo: time('quietTo'),
  };
}
export const DEFAULT_STORM_KP = 6;

/** Don't repeat an alert of the same kind for the same place within these windows. */
export const REPEAT_HOURS = { aurora: 6, forecast: 6, storm: 12, bz: 3, substorm: 2, coupling: 3, flare: 2, shock: 6, cme: 24 } as const;

export type AlertKind = keyof typeof REPEAT_HOURS;

const minutes = (hhmm: string) => { const [h, m] = String(hhmm).split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Whether `t` falls in the quiet hours, read in `timeZone` (overnight ranges such as 23:00-07:00 wrap). */
export function inQuietHours(rules: AlertRules, t: number, timeZone: string | null): boolean {
  if (!rules.quiet) return false;
  let local: number;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timeZone || 'UTC' }).format(t);
    local = minutes(parts);
  } catch {
    return false;
  }
  const a = minutes(rules.quietFrom), b = minutes(rules.quietTo);
  return a === b ? false : a < b ? local >= a && local < b : local >= a || local < b;
}

/** The strongest level a score reaches, or null below 'faint'. */
export const levelFor = (score: number): AlertLevel | null =>
  score >= LEVEL_SCORE.clear ? 'clear' : score >= LEVEL_SCORE.visible ? 'visible' : score >= LEVEL_SCORE.faint ? 'faint' : null;

export interface PlaceDecision { kind: 'aurora' | 'forecast'; level: AlertLevel; score: number }

/**
 * What to send for one place now: an aurora alert when this hour reaches the user's level, or (Chaser)
 * a heads-up when only the next hour does. Repeats and quiet hours are handled by the caller.
 */
export function decidePlace(rules: AlertRules, hours: HourScore[], chaser: boolean): PlaceDecision | null {
  const need = LEVEL_SCORE[rules.level];
  const [now, next] = hours;
  if (rules.aurora && now.score >= need) return { kind: 'aurora', level: levelFor(now.score)!, score: now.score };
  if (chaser && rules.aurora && rules.forecast && next && next.score >= need) return { kind: 'forecast', level: levelFor(next.score)!, score: next.score };
  return null;
}

/** The highest Kp now or forecast within the next three hours. */
export function stormKp(kpNow: number | null, series: { t: number; kp: number }[], now: number): number | null {
  let max = kpNow;
  for (const p of series) if (p.t >= now - 3 * 36e5 && p.t <= now + 3 * 36e5) max = Math.max(max ?? 0, p.kp);
  return max;
}

/** Bz alert (Chaser): the solar wind's north–south magnetic field at or below this, nT ... */
export const BZ_LIMIT = -10;
/** ... for at least this long, in minutes. */
export const BZ_MINUTES = 15;

/**
 * A sustained southward Bz at L1 (DSCOVR, 5-minute means, each stamped at its start): the latest bins,
 * back to back, all at or below BZ_LIMIT and covering BZ_MINUTES. The newest bin has to be recent, so a
 * feed that has stopped never raises an alert. Returns the mean Bz over the run, or null.
 */
export function bzSouth(points: { t: number; bz: number | null }[], now: number): { bz: number; since: number } | null {
  const BIN = 5 * 6e4;
  const pts = points.filter(p => p.bz !== null).sort((a, b) => a.t - b.t);
  const last = pts[pts.length - 1];
  if (!last || last.bz! > BZ_LIMIT || now - (last.t + BIN) > 15 * 6e4) return null;
  let i = pts.length - 1;
  while (i > 0 && pts[i - 1].bz! <= BZ_LIMIT && pts[i].t - pts[i - 1].t <= BIN) i--;
  const run = pts.slice(i);
  if (last.t + BIN - run[0].t < BZ_MINUTES * 6e4) return null;
  return { bz: Math.round((run.reduce((a, p) => a + p.bz!, 0) / run.length) * 10) / 10, since: run[0].t };
}

/**
 * A substorm onset, as NOAA's hemispheric power (GW, a model estimate every 5 minutes) sees it: within
 * 30 minutes, at least doubled, up by 20 GW or more, and 30 GW or more now. The newest value has to be
 * recent. Returns the power before and now, or null.
 */
export function powerJump(points: { observed: number; north: number; south: number }[], hemi: 'north' | 'south', now: number): { from: number; to: number } | null {
  const pts = [...points].sort((a, b) => a.observed - b.observed);
  const last = pts[pts.length - 1];
  if (!last || now - last.observed > 20 * 6e4) return null;
  const before = pts.filter(p => p.observed >= last.observed - 30 * 6e4 && p.observed < last.observed);
  if (!before.length) return null;
  const from = Math.min(...before.map(p => p[hemi])), to = last[hemi];
  return to >= 30 && to >= 2 * from && to - from >= 20 ? { from, to } : null;
}

/** Flare alert: GOES X-ray flux at or above M1 (1e-5 W/m²). */
export const FLARE_M = 1e-5;
export const FLARE_X = 1e-4;

/**
 * A flare under way: the highest 1-minute X-ray flux in the last 10 minutes at M1 or above, with data no
 * more than 15 minutes old. Returns the peak flux so far, or null.
 */
export function flareNow(points: { t: number; flux: number }[], now: number): { flux: number } | null {
  const recent = points.filter(p => p.t > now - 10 * 6e4 && p.t <= now + 6e4);
  if (!recent.length || now - Math.max(...recent.map(p => p.t)) > 15 * 6e4) return null;
  const flux = Math.max(...recent.map(p => p.flux));
  return flux >= FLARE_M ? { flux } : null;
}

/**
 * An interplanetary shock (usually a CME's leading edge) passing L1: over the latest 10 minutes against
 * 30 to 60 minutes earlier, the solar wind speeds up by 50 km/s or more and its density or field strength
 * jumps by half or more. The newest data has to be recent. Returns the speeds before and after, or null.
 */
export function shockArrival(points: { t: number; speed: number | null; density: number | null; bt: number | null }[], now: number): { from: number; to: number } | null {
  const BIN = 5 * 6e4;
  const pts = [...points].sort((a, b) => a.t - b.t);
  const last = pts[pts.length - 1];
  if (!last || now - (last.t + BIN) > 15 * 6e4) return null;
  const mean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const after = pts.filter(p => p.t >= last.t - BIN), before = pts.filter(p => p.t >= last.t - 60 * 6e4 && p.t < last.t - 30 * 6e4);
  const [v1, v0] = [mean(after.map(p => p.speed)), mean(before.map(p => p.speed))];
  if (v1 === null || v0 === null || v1 - v0 < 50) return null;
  const jump = (k: 'density' | 'bt') => { const a = mean(after.map(p => p[k])), b = mean(before.map(p => p[k])); return a !== null && b !== null && b > 0 && a >= 1.5 * b; };
  return jump('density') || jump('bt') ? { from: Math.round(v0), to: Math.round(v1) } : null;
}

/**
 * Newell's coupling function, dΦ/dt = v^4/3 · B_T^2/3 · sin^8/3(θ/2): how fast the solar wind opens Earth's
 * magnetic field (v in km/s; B_T the field across the Sun–Earth line and θ its clock angle, from By and Bz
 * in nT). Quiet times run about 2,000 to 5,000 in these units; strong driving is several times that.
 */
export function newell(speed: number, by: number, bz: number): number {
  const bt = Math.hypot(by, bz), theta = Math.atan2(Math.abs(by), bz);
  return Math.pow(speed, 4 / 3) * Math.pow(bt, 2 / 3) * Math.pow(Math.sin(theta / 2), 8 / 3);
}
/** Coupling alert: the last 30 minutes averaging at least this (about four times a typical value). */
export const COUPLING_HIGH = 15_000;

/** Strong solar-wind driving: Newell coupling averaged over the latest 30 minutes, if every bin has data and it's recent. */
export function couplingHigh(points: { t: number; speed: number | null; by: number | null; bz: number | null }[], now: number): { value: number } | null {
  const BIN = 5 * 6e4;
  const pts = [...points].sort((a, b) => a.t - b.t);
  const last = pts[pts.length - 1];
  if (!last || now - (last.t + BIN) > 15 * 6e4) return null;
  const run = pts.filter(p => p.t > last.t - 30 * 6e4);
  if (run.length < 5 || run.some(p => p.speed === null || p.by === null || p.bz === null)) return null;
  const value = run.reduce((a, p) => a + newell(p.speed!, p.by!, p.bz!), 0) / run.length;
  return value >= COUPLING_HIGH ? { value: Math.round(value) } : null;
}

/** CME forecast alert: an Earth-directed CME expected within 3 days, strong enough (model Kp 5+) to matter for aurora. */
export function cmeComing(cmes: { arrival: number; glancing: boolean; kpHigh: number | null }[], now: number): { arrival: number; kp: number | null; glancing: boolean } | null {
  const next = cmes.filter(c => c.arrival > now && c.arrival < now + 3 * 864e5 && (c.kpHigh === null || c.kpHigh >= 5)).sort((a, b) => a.arrival - b.arrival)[0];
  return next ? { arrival: next.arrival, kp: next.kpHigh, glancing: next.glancing } : null;
}
