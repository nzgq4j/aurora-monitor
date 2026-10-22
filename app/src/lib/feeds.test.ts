import { describe, expect, it } from 'vitest';
import { dailyMax, parseTime } from './feeds';

describe('parseTime', () => {
  it('reads SWPC times as UTC', () => {
    expect(parseTime('2026-10-22 12:00:00.000')).toBe(Date.UTC(2026, 9, 22, 12));
    expect(parseTime('2026-10-22T12:00:00Z')).toBe(Date.UTC(2026, 9, 22, 12));
    expect(parseTime('2026-10-22T14:00:00+02:00')).toBe(Date.UTC(2026, 9, 22, 12));
  });
  it('rejects anything else', () => {
    for (const v of [null, undefined, '', 'soon', 42]) expect(parseTime(v)).toBeNull();
  });
});

describe('dailyMax', () => {
  it('groups 3-hour Kp into UTC-day maxima, oldest first', () => {
    const d = (day: number, hour: number) => Date.UTC(2026, 9, day, hour);
    expect(dailyMax([{ t: d(21, 21), kp: 4 }, { t: d(20, 3), kp: 2 }, { t: d(20, 21), kp: 5.33 }, { t: d(21, 0), kp: 6 }]))
      .toEqual([{ t: d(20, 0), kpMax: 5.33 }, { t: d(21, 0), kpMax: 6 }]);
  });
});
