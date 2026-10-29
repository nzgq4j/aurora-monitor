import { describe, expect, it } from 'vitest';
import { solarLine } from './detailSummaries';
import type { WindPoint } from './feeds';

const H = 36e5, NOW = Date.UTC(2026, 9, 29, 17, 30);
const wind = (from: number, to: number, speed: (t: number) => number): WindPoint[] => {
  const out: WindPoint[] = [];
  for (let t = from; t <= to; t += 3e5) out.push({ t, by: 0, bz: 0, bt: 0, speed: speed(t), density: 1 });
  return out;
};

describe('solarLine', () => {
  it('reads the trend up to now when the feed is current', () => {
    const line = solarLine(wind(NOW - 8 * H, NOW - 5 * 6e4, t => (t > NOW - 2 * H ? 460 : 380)), NOW);
    expect(line).toEqual({ key: 'solar.rising', vars: { from: 380, to: 460, speed: 460 } });
  });

  it('gives the last reading and its time when the feed is behind, not "unavailable"', () => {
    const line = solarLine(wind(NOW - 9 * H, NOW - 55 * 6e4, () => 345), NOW);
    expect(line).toEqual({ key: 'solar.delayed', vars: { speed: 345 }, at: NOW - 55 * 6e4 });
  });

  it('is unavailable only with no readings, or none in the last 6 hours', () => {
    expect(solarLine([], NOW).key).toBe('solar.none');
    expect(solarLine(wind(NOW - 24 * H, NOW - 7 * H, () => 400), NOW).key).toBe('solar.none');
  });
});
