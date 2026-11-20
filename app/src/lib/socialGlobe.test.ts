import { describe, expect, it } from 'vitest';
import { globeSvg, kpModelAurora, regionMapSvg } from './socialGlobe';
import { cardAlt, effectiveStyle } from './socialCard';
import { sampleEvent, type SocialEvent } from './socialEvents';
import { magLat } from './astro';

const T = Date.parse('2026-11-20T21:00:00Z'); // evening over the North Atlantic: magnetic midnight near Greenland/Iceland

describe('kpModelAurora (statistical oval from the Kp forecast)', () => {
  const quiet = kpModelAurora(3, T);
  it('puts quiet-time aurora over Iceland and northern Norway, not over Scotland or Oslo', () => {
    expect(quiet(65, -18)).toBeGreaterThan(8); // Iceland, magnetic ~69°
    expect(quiet(69.65, 18.96)).toBeGreaterThan(5); // Tromsø
    expect(quiet(55.95, -3.19)).toBe(0); // Edinburgh
    expect(quiet(59.91, 10.75)).toBe(0); // Oslo
  });
  it('is a band about 8° wide at midnight, starting near 63° magnetic latitude at Kp 3', () => {
    // Walk north along Iceland's meridian and record where the aurora is.
    const lit = Array.from({ length: 41 }, (_, i) => 50 + i * 0.5).filter(lat => quiet(lat, -25) > 3).map(lat => magLat(lat, -25));
    expect(Math.min(...lit)).toBeGreaterThan(61.5);
    expect(Math.min(...lit)).toBeLessThan(64.5);
    expect(Math.max(...lit) - Math.min(...lit)).toBeLessThan(11);
  });
  it('moves equatorward and brightens as Kp rises, and stays green-yellow when quiet', () => {
    const storm = kpModelAurora(7, T);
    expect(storm(55.95, -3.19)).toBeGreaterThan(0);
    let qMax = 0, sMax = 0;
    for (let lat = 50; lat <= 85; lat++) for (let lon = -180; lon < 180; lon += 2) { qMax = Math.max(qMax, quiet(lat, lon)); sMax = Math.max(sMax, storm(lat, lon)); }
    expect(sMax).toBeGreaterThan(qMax);
    expect(qMax).toBeLessThan(30);
  });
  it('is fainter and further poleward on the dayside; nothing at low latitudes', () => {
    // At 21 UTC it is local noon near 135° W (Alaska): there the band starts further poleward and is weaker.
    const along = (lon: number) => Array.from({ length: 81 }, (_, i) => 50 + i * 0.5).map(lat => ({ m: magLat(lat, lon), v: quiet(lat, lon) })).filter(p => p.v > 0);
    const night = along(-25), day = along(-135);
    expect(Math.min(...day.map(p => p.m))).toBeGreaterThan(Math.min(...night.map(p => p.m)) + 6);
    expect(Math.max(...day.map(p => p.v))).toBeLessThan(Math.max(...night.map(p => p.v)) * 0.6);
    expect(quiet(30, -18)).toBe(0);
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
