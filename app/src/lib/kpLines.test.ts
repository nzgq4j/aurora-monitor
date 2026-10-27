import { describe, expect, it } from 'vitest';
import { kpLine } from './kpLines';
import { magLocalTime } from './astro';

describe('kpLine', () => {
  it('is a plain magnetic-latitude ring without a time', () => {
    const line = kpLine(3);
    expect(line).toHaveLength(181);
    expect(line.every(([lat]) => lat > 45 && lat < 75)).toBe(true);
  });

  it('follows the oval: furthest from the pole near magnetic midnight, drawn in on the day side', () => {
    const t = Date.UTC(2026, 9, 27, 21);
    const line = kpLine(3, false, t);
    const at = (want: number) => line.reduce((best, p) => {
      const d = (x: number) => Math.min(Math.abs(x - want), 24 - Math.abs(x - want));
      return d(magLocalTime(p[0], p[1], t)) < d(magLocalTime(best[0], best[1], t)) ? p : best;
    });
    const plain = kpLine(3);
    const shift = ([lat, lon]: [number, number]) => lat - plain.find(p => p[1] === lon)![0];
    expect(Math.abs(shift(at(23)))).toBeLessThan(0.5);
    expect(shift(at(11))).toBeGreaterThan(4);
  });
});
