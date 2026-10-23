import { describe, expect, it } from 'vitest';
import { periodDays } from './playBilling';

describe('periodDays', () => {
  it('reads the trial lengths Play reports', () => {
    expect(periodDays('P7D')).toBe(7);
    expect(periodDays('P14D')).toBe(14);
    expect(periodDays('P1W')).toBe(7);
    expect(periodDays('P1M')).toBe(30);
  });
  it('ignores what it cannot read', () => {
    expect(periodDays('')).toBeUndefined();
    expect(periodDays('7 days')).toBeUndefined();
  });
});
