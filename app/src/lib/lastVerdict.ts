import type { Conditions } from '../app/api/conditions/route';
import type { moon } from './astro';
import type { HourScore, verdict } from './tonight';

/**
 * The last verdict worked out online for each place, kept on this device (#68) so it can be shown,
 * clearly dated, when there's no connection: common at dark-sky spots.
 */
export interface SavedVerdict {
  /** When it was worked out (ms). */
  at: number;
  cond: Conditions;
  hours: HourScore[];
  v: ReturnType<typeof verdict>;
  m: ReturnType<typeof moon>;
}

const KEY = 'pl.verdicts';
/** Places kept (the most recently saved). */
const KEEP = 8;
const placeKey = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

function readAll(): Record<string, SavedVerdict> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, SavedVerdict>; } catch { return {}; }
}

export function saveVerdict(lat: number, lon: number, s: SavedVerdict) {
  const all = readAll();
  all[placeKey(lat, lon)] = s;
  const kept = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, KEEP);
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept))); } catch { /* storage unavailable or full */ }
}

export function readVerdict(lat: number, lon: number): SavedVerdict | null {
  return readAll()[placeKey(lat, lon)] ?? null;
}
