import { describe, expect, it } from 'vitest';
import { auroraFactor, verdict, type HourScore } from './tonight';

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
