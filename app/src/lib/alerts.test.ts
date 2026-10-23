import { describe, expect, it } from 'vitest';
import { COUPLING_HIGH, DEFAULT_RULES, bzSouth, cmeComing, couplingHigh, decidePlace, flareNow, inQuietHours, levelKp, newell, normalizeRules, powerJump, shockArrival, stormKp, type AlertRules } from './alerts';
import type { HourScore } from './tonight';

const hour = (score: number): HourScore => ({ t: 0, score, kp: 5, cloud: 0, sunAlt: -20, moonUp: false, f: { aurora: 1, dark: 1, cloud: 1, moon: 1 } });

describe('normalizeRules', () => {
  it('keeps valid rules', () => {
    const r: AlertRules = { aurora: false, level: 'clear', forecast: false, storm: true, quiet: true, quietFrom: '22:30', quietTo: '06:15' };
    expect(normalizeRules(r)).toEqual(r);
  });
  it('falls back to the defaults for anything of the wrong type', () => {
    for (const raw of [null, 5, 'x', [], { quietFrom: 5, quietTo: {}, level: 'huge', aurora: 'yes' }, { quietFrom: '25:00' }]) {
      expect(normalizeRules(raw)).toEqual(DEFAULT_RULES);
    }
  });
});

describe('inQuietHours', () => {
  const at = (iso: string) => Date.parse(iso);
  const rules = { ...DEFAULT_RULES, quiet: true, quietFrom: '23:00', quietTo: '07:00' };
  it('wraps overnight ranges', () => {
    expect(inQuietHours(rules, at('2026-10-22T23:30:00Z'), 'UTC')).toBe(true);
    expect(inQuietHours(rules, at('2026-10-22T06:59:00Z'), 'UTC')).toBe(true);
    expect(inQuietHours(rules, at('2026-10-22T07:00:00Z'), 'UTC')).toBe(false);
    expect(inQuietHours(rules, at('2026-10-22T12:00:00Z'), 'UTC')).toBe(false);
  });
  it('reads the time in the user’s time zone', () => {
    // 21:30 UTC is 23:30 in Oslo (CEST, UTC+2) on 22 October.
    expect(inQuietHours(rules, at('2026-10-22T21:30:00Z'), 'Europe/Oslo')).toBe(true);
  });
  it('is off when quiet hours are off, equal, or the zone is unknown', () => {
    expect(inQuietHours({ ...rules, quiet: false }, at('2026-10-22T23:30:00Z'), 'UTC')).toBe(false);
    expect(inQuietHours({ ...rules, quietTo: '23:00' }, at('2026-10-22T23:30:00Z'), 'UTC')).toBe(false);
    expect(inQuietHours(rules, at('2026-10-22T23:30:00Z'), 'Not/AZone')).toBe(false);
  });
  it('never throws on malformed saved times', () => {
    const bad = { ...rules, quietFrom: 5 as unknown as string, quietTo: null as unknown as string };
    expect(() => inQuietHours(bad, Date.now(), 'UTC')).not.toThrow();
  });
});

describe('decidePlace', () => {
  const rules = { ...DEFAULT_RULES, level: 'visible' as const };
  it('alerts when this hour reaches the level', () => {
    expect(decidePlace(rules, [hour(50), hour(10)], false)).toEqual({ kind: 'aurora', level: 'visible', score: 50 });
    expect(decidePlace(rules, [hour(75), hour(10)], false)?.level).toBe('clear');
  });
  it('sends a heads-up for the next hour only to Chaser', () => {
    expect(decidePlace(rules, [hour(10), hour(60)], true)).toEqual({ kind: 'forecast', level: 'visible', score: 60 });
    expect(decidePlace(rules, [hour(10), hour(60)], false)).toBeNull();
    expect(decidePlace({ ...rules, forecast: false }, [hour(10), hour(60)], true)).toBeNull();
  });
  it('sends nothing below the level or with aurora alerts off', () => {
    expect(decidePlace(rules, [hour(44), hour(44)], true)).toBeNull();
    expect(decidePlace({ ...rules, aurora: false }, [hour(90), hour(90)], true)).toBeNull();
  });
});

describe('stormKp', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  it('takes the highest Kp now or within three hours either side', () => {
    const series = [{ t: now - 4 * 36e5, kp: 9 }, { t: now - 36e5, kp: 5 }, { t: now + 2 * 36e5, kp: 6.67 }, { t: now + 4 * 36e5, kp: 8 }];
    expect(stormKp(4, series, now)).toBe(6.67);
  });
  it('is null with no data', () => expect(stormKp(null, [], now)).toBeNull());
});

describe('levelKp', () => {
  it('orders faint < visible < clear around the place’s threshold', () => {
    const need = 5;
    expect(levelKp('faint', need)).toBeCloseTo(need - 0.66, 1);
    expect(levelKp('visible', need)).toBeCloseTo(need + 0.33, 1);
    expect(levelKp('clear', need)).toBeCloseTo(need + 1.21, 1);
  });
  it('never goes below zero', () => expect(levelKp('faint', 0)).toBe(0));
});

describe('technical alerts', () => {
  const now = Date.UTC(2026, 10, 20, 22);
  const bins = (vals: (number | null)[]) => vals.map((bz, i) => ({ t: now - (vals.length - i) * 3e5, bz }));
  it('Bz: 15 minutes at or below −10 nT, ending now', () => {
    expect(bzSouth(bins([-3, -11, -12, -14]), now)).toEqual({ bz: -12.3, since: now - 3 * 3e5 });
    expect(bzSouth(bins([-3, -2, -12, -14]), now)).toBeNull();
    expect(bzSouth(bins([-12, -14, -15, -6]), now)).toBeNull();
  });
  it('Bz: a stale feed raises nothing', () => {
    expect(bzSouth(bins([-12, -14, -15]), now + 3 * 36e5)).toBeNull();
  });
  const hp = (vals: number[]) => vals.map((v, i) => ({ observed: now - (vals.length - 1 - i) * 3e5, north: v, south: 5 }));
  it('substorm: a sharp rise in hemispheric power', () => {
    expect(powerJump(hp([12, 14, 15, 22, 35, 48]), 'north', now)).toEqual({ from: 12, to: 48 });
    expect(powerJump(hp([40, 45, 48, 50, 55, 60]), 'north', now)).toBeNull();
    expect(powerJump(hp([5, 6, 8, 12, 18, 24]), 'north', now)).toBeNull();
    expect(powerJump(hp([12, 14, 15, 22, 35, 48]), 'south', now)).toBeNull();
  });
});

describe('scientific alerts', () => {
  const now = Date.UTC(2026, 10, 20, 22);
  it('flare: M1 or more in the last 10 minutes, with fresh data', () => {
    const xr = (vals: number[]) => vals.map((flux, i) => ({ t: now - (vals.length - 1 - i) * 6e4, flux }));
    expect(flareNow(xr([2e-6, 4e-6, 1.2e-5, 2.3e-5]), now)).toEqual({ flux: 2.3e-5 });
    expect(flareNow(xr([2e-6, 4e-6, 6e-6]), now)).toBeNull();
    expect(flareNow(xr([2e-5]), now + 36e5)).toBeNull();
  });
  const wind = (rows: [number, number, number][]) => rows.map(([speed, density, bt], i, a) => ({ t: now - (a.length - i) * 3e5, speed, density, bt, by: 3, bz: -5 }));
  it('shock: a jump in speed with density or field', () => {
    const quiet = Array.from({ length: 10 }, () => [400, 5, 6] as [number, number, number]);
    expect(shockArrival(wind([...quiet, [520, 14, 18], [530, 15, 19]]), now)).toEqual({ from: 400, to: 525 });
    expect(shockArrival(wind([...quiet, [420, 5, 6], [425, 5, 6]]), now)).toBeNull();
    expect(shockArrival(wind([...quiet, [520, 5, 6], [530, 5, 6]]), now)).toBeNull();
  });
  it('coupling: Newell is near zero for northward field and large for strong southward field', () => {
    expect(newell(400, 0, 5)).toBeCloseTo(0, 3);
    expect(newell(400, 0, -5)).toBeGreaterThan(newell(400, 5, 0));
    expect(Math.round(newell(600, 0, -15))).toBeGreaterThan(COUPLING_HIGH);
  });
  it('coupling: half an hour of strong driving', () => {
    const run = (bz: number) => Array.from({ length: 7 }, (_, i) => ({ t: now - (7 - i) * 3e5, speed: 650, by: 2, bz }));
    expect(couplingHigh(run(-15), now)).not.toBeNull();
    expect(couplingHigh(run(-3), now)).toBeNull();
  });
  it('CME: the next Earth-directed arrival within 3 days that could matter', () => {
    const cmes = [{ arrival: now - 36e5, glancing: false, kpHigh: 7 }, { arrival: now + 30 * 36e5, glancing: true, kpHigh: 4 }, { arrival: now + 40 * 36e5, glancing: false, kpHigh: 6 }];
    expect(cmeComing(cmes, now)).toEqual({ arrival: now + 40 * 36e5, kp: 6, glancing: false });
    expect(cmeComing([{ arrival: now + 5 * 864e5, glancing: false, kpHigh: 8 }], now)).toBeNull();
  });
});
