import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, decidePlace, inQuietHours, levelKp, normalizeRules, stormKp, type AlertRules } from './alerts';
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
