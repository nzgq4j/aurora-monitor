import { describe, expect, it } from 'vitest';
import { globeSvg, kpModelOval, regionMapSvg } from './socialGlobe';
import { cardAlt, effectiveStyle } from './socialCard';
import { sampleEvent, type SocialEvent } from './socialEvents';

const T = Date.parse('2026-11-19T22:00:00Z'); // near magnetic midnight over the North Atlantic
const at = (o: ReturnType<typeof kpModelOval>, lat: number, lon: number) => o.grid[Math.round(lat) + 90][((Math.round(lon) % 360) + 360) % 360];

describe('kpModelOval', () => {
  it('puts quiet aurora over Iceland and northern Norway, not over Scotland', () => {
    const quiet = kpModelOval(2.67, T);
    expect(at(quiet, 65, -19)).toBeGreaterThan(10); // Iceland
    expect(at(quiet, 69, 19)).toBeGreaterThan(10); // Tromsø
    expect(at(quiet, 56, -3)).toBe(0); // Edinburgh
  });
  it('moves equatorward and brightens as Kp rises', () => {
    const storm = kpModelOval(7, T);
    expect(at(storm, 56, -3)).toBeGreaterThan(0);
    const max = (o: ReturnType<typeof kpModelOval>) => Math.max(...o.grid.map(r => Math.max(...r)));
    expect(max(storm)).toBeGreaterThan(max(kpModelOval(2.67, T)));
    expect(max(kpModelOval(2.67, T))).toBeLessThan(30); // quiet stays green-yellow, like OVATION
  });
  it('is weaker on the dayside than at magnetic midnight, and empty at low latitudes', () => {
    const o = kpModelOval(4, T);
    expect(at(o, 66, 100)).toBeLessThan(at(o, 66, -19)); // Siberia at local morning vs Iceland at night
    expect(o.grid.slice(90 - 30, 90 + 31).every(r => r.every(v => v === 0))).toBe(true);
  });
});

describe('art', () => {
  const pathJumps = (svg: string, w: number) => {
    const d = svg.match(/<path d="([^"]+)"/)![1];
    let jumps = 0;
    for (const ring of d.split('Z')) {
      const xs = [...ring.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(m => Number(m[1]));
      for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - xs[i - 1]) > w) jumps++;
    }
    return jumps;
  };
  it('the regional map keeps coastlines that cross 180° in one piece (no jumps across the map)', async () => {
    for (const site of [{ lat: 64.9, lon: -18.6 }, { lat: 66.87, lon: 13.7 }, { lat: 64.84, lon: -147.7 }]) {
      expect(pathJumps(await regionMapSvg({ w: 952, h: 720, site }), 952)).toBe(0);
    }
  });
  it('a zoomed globe draws a framed close-up with the site marked', async () => {
    const svg = await globeSvg({ w: 952, h: 500, zoom: 2.6, center: { lat: 68, lon: -18.6 }, t: T, marker: { lat: 64.9, lon: -18.6 } });
    expect(svg).toContain('width="952" height="500"');
    expect(svg).toContain('rx="24"');
    expect(svg).toMatch(/<circle cx="476" cy="[\d.]+" r="15"/);
  });
});

describe('viewing cards', () => {
  const tonight = sampleEvent('viewing', T);
  const now: SocialEvent = { ...tonight, viewing: { ...tonight.viewing!, mode: 'now' } };
  it('tonight always shows the forecast globe; now shows the live globe or map', () => {
    for (const style of ['card', 'map', 'globe'] as const) expect(effectiveStyle({ ...tonight, style }, {})).toBe('globe');
    expect(effectiveStyle({ ...now, style: 'map' }, {})).toBe('map');
    expect(effectiveStyle({ ...now, style: 'card' }, {})).toBe('globe');
  });
  it('alt text says the tonight oval is a Kp-forecast model, and the live one is OVATION', () => {
    const a = cardAlt({ ...tonight, style: 'globe' }, {});
    expect(a).toContain("modelled from NOAA's Kp forecast");
    expect(a).not.toContain('OVATION');
    expect(cardAlt({ ...now, style: 'globe' }, {})).toContain('current aurora forecast (OVATION)');
  });
});
