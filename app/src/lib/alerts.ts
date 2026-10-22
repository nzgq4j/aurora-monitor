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
export const REPEAT_HOURS = { aurora: 6, forecast: 6, storm: 12 } as const;

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
