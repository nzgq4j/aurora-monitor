/**
 * Map and globe drawings for share cards, as SVG strings (no projection library needed):
 * - globeSvg: an orthographic globe centred on a point, with land, night and day, the live aurora oval in both
 *   hemispheres and an optional marked site.
 * - regionMapSvg: a regional map around a site (about 1,500 km across) with the oval and the site marked.
 * Land comes from world-atlas (Natural Earth). Satori can't draw fonts inside nested SVG, so labels are added by
 * the card as positioned text.
 */

import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import land110 from 'world-atlas/land-110m.json';
import land50 from 'world-atlas/land-50m.json';
import { auroraColor } from './auroraColor';
import { sunAltitude } from './astro';
import type { Oval } from './feeds';

const GREEN = '#6CFF2B';
const r1 = (n: number) => Math.round(n * 10) / 10;
const RAD = Math.PI / 180;

type Ring = [number, number][];
const cache = new Map<string, Ring[]>();
function rings(which: '110m' | '50m'): Ring[] {
  if (!cache.has(which)) {
    const topo = (which === '110m' ? land110 : land50) as unknown as Topology<{ land: GeometryCollection }>;
    const fc = feature(topo, topo.objects.land) as unknown as { features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] };
    cache.set(which, fc.features.flatMap(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][])))
      .flatMap(poly => poly.map(ring => ring.map(([lon, lat]) => [lon, lat] as [number, number]))));
  }
  return cache.get(which)!;
}

export interface Point { lat: number; lon: number }

/** OVATION probability at any point, interpolated between the 1° grid cells. */
function ovalAtPoint(oval: Oval, lat: number, lon: number): number {
  const y = Math.max(0, Math.min(180, lat + 90)), x = ((lon % 360) + 360) % 360;
  const y0 = Math.floor(y), x0 = Math.floor(x), fy = y - y0, fx = x - x0;
  const g = (yy: number, xx: number) => oval.grid[Math.min(180, yy)][xx % 360];
  return (g(y0, x0) * (1 - fx) + g(y0, x0 + 1) * fx) * (1 - fy) + (g(y0 + 1, x0) * (1 - fx) + g(y0 + 1, x0 + 1) * fx) * fy;
}

/** An RGBA layer computed per pixel (`px` returns [r, g, b, a 0–255] or null), as a PNG data URL. */
async function raster(w: number, h: number, px: (x: number, y: number) => [number, number, number, number] | null): Promise<string> {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = px(x + 0.5, y + 0.5);
    if (v) buf.set(v, (y * w + x) * 4);
  }
  const sharp = (await import('sharp')).default;
  const png = await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}
const auroraPx = (p: number): [number, number, number, number] | null => {
  if (p < 3) return null;
  const { rgb, alpha } = auroraColor(p);
  return [rgb[0], rgb[1], rgb[2], Math.round(alpha * 255)];
};
const image = (href: string, w: number, h: number) => `<image x="0" y="0" width="${w}" height="${h}" href="${href}" xlink:href="${href}" preserveAspectRatio="none"/>`;

/**
 * Orthographic globe of radius side/2 centred on `center`. Land is filled; points beyond the horizon are pulled
 * onto the rim so coastlines that cross it still close. Daylight (a lighter wash, fading through twilight) and the
 * aurora oval are smooth layers computed per pixel from the Sun's altitude at `t` and the OVATION grid.
 */
export async function globeSvg(opts: { side: number; center: Point; oval?: Oval | null; t: number; marker?: Point | null }): Promise<string> {
  const { side, center, oval, t, marker } = opts;
  const R = side / 2 - 6, c = side / 2;
  const φ0 = center.lat * RAD, λ0 = center.lon * RAD;
  const sinφ0 = Math.sin(φ0), cosφ0 = Math.cos(φ0);
  const proj = (lat: number, lon: number): { x: number; y: number; front: boolean } => {
    const φ = lat * RAD, dλ = lon * RAD - λ0;
    const cosc = sinφ0 * Math.sin(φ) + cosφ0 * Math.cos(φ) * Math.cos(dλ);
    let x = Math.cos(φ) * Math.sin(dλ), y = cosφ0 * Math.sin(φ) - sinφ0 * Math.cos(φ) * Math.cos(dλ);
    if (cosc < 0) { const n = Math.hypot(x, y) || 1; x /= n; y /= n; } // behind: onto the rim
    return { x: c + R * x, y: c - R * y, front: cosc >= 0 };
  };
  // Inverse projection (pixel → lat/lon), for the per-pixel layers; null off the globe.
  const S = 360, scale = side / S;
  const inv = (px: number, py: number): Point | null => {
    const x = (px * scale - c) / R, y = (c - py * scale) / R, ρ = Math.hypot(x, y);
    if (ρ > 1) return null;
    const cc = Math.asin(ρ), sinc = Math.sin(cc), cosc = Math.cos(cc);
    const lat = Math.asin(cosc * sinφ0 + (ρ ? (y * sinc * cosφ0) / ρ : 0)) / RAD;
    const lon = (λ0 + Math.atan2(x * sinc, ρ * cosφ0 * cosc - y * sinφ0 * sinc)) / RAD;
    return { lat, lon };
  };
  const land = rings('110m').map(ring => {
    const pts = ring.map(([lon, lat]) => proj(lat, lon));
    if (!pts.some(p => p.front)) return '';
    return pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x)} ${r1(p.y)}`).join('') + 'Z';
  }).filter(Boolean).join('');
  const [day, aurora] = await Promise.all([
    raster(S, S, (x, y) => {
      const p = inv(x, y);
      if (!p) return null;
      const alt = sunAltitude(t, p.lat, p.lon);
      const k = Math.max(0, Math.min(1, (alt + 12) / 12)); // dark below −12°, full daylight from 0°
      return k > 0 ? [150, 205, 255, Math.round(k * 46)] : null;
    }),
    oval ? raster(S, S, (x, y) => { const p = inv(x, y); return p ? auroraPx(ovalAtPoint(oval, p.lat, p.lon)) : null; }) : Promise.resolve(null),
  ]);
  const m = marker ? proj(marker.lat, marker.lon) : null;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">`
    + `<defs><clipPath id="g"><circle cx="${c}" cy="${c}" r="${R}"/></clipPath>`
    + `<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="88%" stop-color="${GREEN}" stop-opacity="0"/><stop offset="100%" stop-color="${GREEN}" stop-opacity="0.3"/></radialGradient></defs>`
    + `<circle cx="${c}" cy="${c}" r="${c}" fill="url(#glow)"/>`
    + `<circle cx="${c}" cy="${c}" r="${R}" fill="#050b10"/>`
    + `<g clip-path="url(#g)"><path d="${land}" fill="#16231b" stroke="#2f4236" stroke-width="1"/>${image(day, side, side)}${aurora ? image(aurora, side, side) : ''}</g>`
    + `<circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="#2a302c" stroke-width="2"/>`
    + (m && m.front ? `<circle cx="${r1(m.x)}" cy="${r1(m.y)}" r="15" fill="none" stroke="${GREEN}" stroke-width="4"/><circle cx="${r1(m.x)}" cy="${r1(m.y)}" r="6.5" fill="#fff" stroke="#000" stroke-width="2"/>` : '')
    + '</svg>';
}

/** Where a globe should look for a hemisphere's aurora right now: 62° from the equator, under local midnight. */
export function midnightCenter(t: number, south = false): Point {
  // Longitude where it is about local midnight: opposite the subsolar longitude (from the Sun's hour angle at 0°).
  let best = 0, low = Infinity;
  for (let lon = -180; lon < 180; lon += 2) { const a = sunAltitude(t, 0, lon); if (a < low) { low = a; best = lon; } }
  return { lat: south ? -62 : 62, lon: best };
}

/**
 * Regional map around `site`: `spanKm` across, local equirectangular projection scaled for the site's latitude,
 * with detailed land (1:50m), the aurora oval in 1° cells, a 5° graticule and the site marked.
 */
export async function regionMapSvg(opts: { w: number; h: number; site: Point; oval?: Oval | null; spanKm?: number }): Promise<string> {
  const { w, h, site, oval, spanKm = 1600 } = opts;
  const kmPerDegLat = 111.2, cosφ = Math.max(0.2, Math.cos(site.lat * RAD));
  const k = w / spanKm; // px per km
  const X = (lon: number) => w / 2 + ((((lon - site.lon + 540) % 360) - 180) * kmPerDegLat * cosφ) * k;
  const Y = (lat: number) => h / 2 - (lat - site.lat) * kmPerDegLat * k;
  const latSpan = h / k / kmPerDegLat / 2 + 2, lonSpan = w / k / (kmPerDegLat * cosφ) / 2 + 2;
  const near = (lat: number, lon: number) => Math.abs(lat - site.lat) < latSpan + 10 && Math.abs((((lon - site.lon + 540) % 360) - 180)) < lonSpan + 20;
  const land = rings('50m').filter(r => r.some(([lon, lat]) => near(lat, lon)))
    .map(r => r.map(([lon, lat], i) => `${i ? 'L' : 'M'}${r1(X(lon))} ${r1(Y(lat))}`).join('') + 'Z').join('');
  // The oval as a smooth layer: each pixel back to lat/lon, interpolated from the 1° grid.
  const S = 4, aurora = oval ? await raster(Math.ceil(w / S), Math.ceil(h / S), (x, y) => {
    const lat = site.lat - (y * S - h / 2) / (kmPerDegLat * k);
    const lon = site.lon + (x * S - w / 2) / (kmPerDegLat * cosφ * k);
    return auroraPx(ovalAtPoint(oval, lat, lon));
  }) : null;
  const grid: string[] = [];
  for (let lat = Math.ceil((site.lat - latSpan) / 5) * 5; lat <= site.lat + latSpan; lat += 5) grid.push(`<line x1="0" x2="${w}" y1="${r1(Y(lat))}" y2="${r1(Y(lat))}" stroke="#fff" stroke-opacity="0.08" stroke-width="1.5" stroke-dasharray="4 6"/>`);
  for (let lon = Math.ceil((site.lon - lonSpan) / 10) * 10; lon <= site.lon + lonSpan; lon += 10) grid.push(`<line y1="0" y2="${h}" x1="${r1(X(lon))}" x2="${r1(X(lon))}" stroke="#fff" stroke-opacity="0.08" stroke-width="1.5" stroke-dasharray="4 6"/>`);
  const sx = r1(X(site.lon)), sy = r1(Y(site.lat));
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<defs><clipPath id="m"><rect width="${w}" height="${h}" rx="24"/></clipPath></defs>`
    + `<g clip-path="url(#m)"><rect width="${w}" height="${h}" fill="#050b10"/><path d="${land}" fill="#16231b" stroke="#3b4a40" stroke-width="1.2"/>${aurora ? image(aurora, w, h) : ''}${grid.join('')}`
    + `<circle cx="${sx}" cy="${sy}" r="20" fill="none" stroke="${GREEN}" stroke-width="4"/><circle cx="${sx}" cy="${sy}" r="8" fill="#fff" stroke="#000" stroke-width="2"/></g>`
    + `<rect width="${w}" height="${h}" rx="24" fill="none" stroke="#2a302c" stroke-width="2"/></svg>`;
}
