import { describe, expect, it } from 'vitest';
import { classFlux, parseGeomagProbs, solarLevel, stormHeadline, xrayClass } from './storm';

describe('xrayClass', () => {
  it('names every two-digit class exactly (no floating-point drift)', () => {
    for (const [c, e] of [['A', -8], ['B', -7], ['C', -6], ['M', -5], ['X', -4]] as const) {
      for (let m = 10; m < 100; m++) expect(xrayClass(Number(`${m / 10}e${e}`))).toBe(`${c}${(m / 10).toFixed(1)}`);
    }
  });
  it('rounds down to a tenth and handles tiny flux', () => {
    expect(xrayClass(2.15e-5)).toBe('M2.1');
    expect(xrayClass(1e-9)).toBe('A0.0');
  });
  it('round-trips with classFlux', () => expect(xrayClass(classFlux('X1.3'))).toBe('X1.3'));
});

describe('solarLevel', () => {
  it('follows SWPC wording', () => {
    expect(solarLevel(null)).toBe('veryLow');
    expect(solarLevel(5e-7)).toBe('veryLow');
    expect(solarLevel(3e-6)).toBe('low');
    expect(solarLevel(2e-5)).toBe('moderate');
    expect(solarLevel(6e-5)).toBe('high');
    expect(solarLevel(2e-4)).toBe('high');
  });
});

const forecast = (issued: string, range: string) => `:Product: 3-Day Geomagnetic Forecast
:Issued: ${issued} 2205 UTC
NOAA Geomagnetic Activity Probabilities ${range}
Active                35/30/40
Minor storm           40/10/25
Moderate storm        10/05/15
Strong-Extreme storm  01/01/30
`;

describe('parseGeomagProbs', () => {
  it('reads the three days', () => {
    const days = parseGeomagProbs(forecast('2026 Oct 18', '19 Oct-21 Oct'));
    expect(days.map(d => d.day)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
    expect(days[0]).toMatchObject({ active: 35, minor: 40, moderate: 10, strong: 1 });
  });
  it('rolls a late-December issue into January', () => {
    expect(parseGeomagProbs(forecast('2026 Dec 31', '01 Jan-03 Jan'))[0].day).toBe('2027-01-01');
  });
  it('returns nothing for text it can’t read', () => expect(parseGeomagProbs('nonsense')).toEqual([]));
});

describe('stormHeadline', () => {
  it('picks the most severe likely level and its day', () => {
    const days = parseGeomagProbs(forecast('2026 Oct 18', '19 Oct-21 Oct'));
    expect(stormHeadline(days)).toEqual({ level: 'strong', day: '2026-10-21', prob: 30 });
  });
  it('is quiet when nothing reaches 25 %', () => {
    expect(stormHeadline([{ day: '2026-10-19', active: 10, minor: 5, moderate: 1, strong: 1 }]).level).toBe('quiet');
  });
});
