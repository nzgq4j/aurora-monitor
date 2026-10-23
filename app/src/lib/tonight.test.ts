import { describe, expect, it } from 'vitest';
import { auroraFactor, hourlyScores, verdict, type HourScore } from './tonight';
import { magLocalTime, ovalShift } from './astro';

const h = (i: number, score: number, f: Partial<HourScore['f']> = {}, kp = 5): HourScore =>
  ({ t: Date.UTC(2026, 9, 22, 18 + i), score, kp, cloud: 0, sunAlt: -20, moonUp: false, f: { aurora: 1, dark: 1, cloud: 1, moon: 1, ...f } });

describe('auroraFactor', () => {
  it('is about 0.35 at the threshold and rises with Kp', () => {
    expect(auroraFactor(5, 5)).toBeCloseTo(0.354, 2);
    expect(auroraFactor(6, 5)).toBeGreaterThan(0.6);
    expect(auroraFactor(9, 5)).toBeGreaterThan(auroraFactor(7, 5));
  });
});

describe('verdict', () => {
  it('says go now when this hour scores 50 or more', () => {
    const v = verdict([h(0, 60), h(1, 70), h(2, 20)], 5);
    expect(v.level).toBe('goNow');
    expect(v.score).toBe(60);
    expect(v.limit).toBeNull();
  });
  it('says go later and gives the window around the best hour', () => {
    const v = verdict([h(0, 10), h(1, 55), h(2, 60), h(3, 15)], 5);
    expect(v.level).toBe('goLater');
    expect(v.window).toEqual({ from: h(1, 0).t, to: h(2, 0).t + 36e5 });
  });
  it('names what holds a maybe back', () => {
    const v = verdict([h(0, 10, { cloud: 0.3 }), h(1, 30, { cloud: 0.4 })], 5);
    expect(v.level).toBe('maybe');
    expect(v.limit).toBe('cloud');
  });
  it('says no when nothing reaches 20', () => {
    expect(verdict([h(0, 5, { aurora: 0.1 }), h(1, 10, { aurora: 0.2 })], 5).level).toBe('no');
  });
  it('rates how high to look from the Kp margin', () => {
    expect(verdict([h(0, 80, {}, 9)], 5).look).toBe('overhead');
    expect(verdict([h(0, 80, {}, 6.5)], 5).look).toBe('high');
    expect(verdict([h(0, 80, {}, 5.5)], 5).look).toBe('low');
  });
});

describe('unavailable', () => {
  it('says so when no hour has Kp or the OVATION model', () => {
    const hours = hourlyScores({ lat: 69.6, lon: 18.9, need: 1, kpNow: null, series: [], ovationNearby: null, cloudNow: 0, cloudHourly: [], moonIllumination: 0, now: Date.UTC(2026, 9, 22, 22) });
    expect(hours.every(x => x.unknown)).toBe(true);
    expect(verdict(hours, 1)).toMatchObject({ level: 'unavailable', window: null, limit: null });
  });
  it('still judges when only the OVATION model is there', () => {
    const hours = hourlyScores({ lat: 69.6, lon: 18.9, need: 1, kpNow: null, series: [], ovationNearby: 40, cloudNow: 0, cloudHourly: [], moonIllumination: 0, now: Date.UTC(2026, 9, 22, 22) });
    expect(verdict(hours, 1).level).not.toBe('unavailable');
  });
});

describe('OVATION and Kp agree', () => {
  // Sandnessjøen at dawn, 23 Oct 2026 03:34 UT: Kp 1.7 (the place needs Kp 0 at magnetic midnight),
  // OVATION 4 % within reach, clear and dark. It used to say "Go out now, 75".
  const base = { lat: 66.02, lon: 12.63, need: 0, kpNow: 1.67, series: [], cloudNow: 6, cloudHourly: [], moonIllumination: 0.89, now: Date.UTC(2026, 9, 23, 3, 34) };
  it('a low OVATION reading keeps a quiet dawn from being a go', () => {
    const v = verdict(hourlyScores({ ...base, ovationNearby: 4 }), 0);
    expect(v.level).not.toBe('goNow');
    expect(v.score).toBeLessThan(35);
  });
  it('a strong OVATION reading is a go even when Kp is low', () => {
    expect(verdict(hourlyScores({ ...base, ovationNearby: 30 }), 0).level).toBe('goNow');
  });
  it('a low OVATION reading lowers the next few hours, then the Kp forecast takes over', () => {
    const series = [18, 21, 0, 3, 6].map(h => ({ t: Date.UTC(2026, 9, 22 + (h < 12 ? 1 : 0), h), kp: 3, kind: 'estimated' as const }));
    const at = { ...base, now: Date.UTC(2026, 9, 22, 20), kpNow: 3, series };
    const withOv = hourlyScores({ ...at, ovationNearby: 2 }), kpOnly = hourlyScores({ ...at, ovationNearby: null });
    for (const i of [0, 1, 2, 3, 4]) expect(withOv[i].f.aurora).toBeLessThan(kpOnly[i].f.aurora);
    // The correction fades: smaller in hour 4 than hour 2, gone from hour 5.
    expect(kpOnly[4].f.aurora - withOv[4].f.aurora).toBeLessThan(kpOnly[2].f.aurora - withOv[2].f.aurora);
    for (const i of [5, 6, 7]) expect(withOv[i].f.aurora).toBeCloseTo(kpOnly[i].f.aurora, 6);
  });
});

describe('magnetic local time', () => {
  it('puts Tromsø near magnetic midnight at 22 UT and Sandnessjøen at dawn at 03:30 UT', () => {
    expect(Math.abs(((magLocalTime(69.65, 18.96, Date.UTC(2026, 9, 23, 22)) + 12) % 24) - 12)).toBeLessThan(1.5);
    expect(magLocalTime(66.02, 12.63, Date.UTC(2026, 9, 23, 3, 30))).toBeGreaterThan(4.5);
    expect(magLocalTime(66.02, 12.63, Date.UTC(2026, 9, 23, 3, 30))).toBeLessThan(7);
  });
  it('moves the oval poleward away from midnight', () => {
    expect(ovalShift(23)).toBe(0);
    expect(ovalShift(1)).toBe(0);
    expect(ovalShift(4)).toBe(3);
    expect(ovalShift(6)).toBe(5);
    expect(ovalShift(12)).toBe(6);
  });
});
