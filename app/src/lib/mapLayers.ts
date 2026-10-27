import { DARK_ALT, subsolarPoint } from './astro';
import { CLOUD_HI, CLOUD_LO } from './cloudify';
import { sampleOval } from './ovalSmooth';

/** Map layers, shared by the 2D map and the 3D globe and remembered per device. */
export type LayerId = 'aurora' | 'clouds' | 'night' | 'best' | 'sightings' | 'saved' | 'lights';
export type Layers = Record<LayerId, boolean>;
export const LAYER_IDS: LayerId[] = ['aurora', 'clouds', 'night', 'best', 'sightings', 'saved', 'lights'];
export const DEFAULT_LAYERS: Layers = { aurora: true, clouds: false, night: false, best: false, sightings: true, saved: true, lights: true };
const KEY = 'pl.map.layers';

export function readLayers(): Layers {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<Layers> | null;
    return saved ? { ...DEFAULT_LAYERS, ...saved } : DEFAULT_LAYERS;
  } catch { return DEFAULT_LAYERS; }
}
export function writeLayers(l: Layers) {
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage unavailable */ }
}

/**
 * Run heavy drawing (a world overlay is up to ~1 M pixels) after the browser has painted the current
 * update, so a tap shows its result at once instead of waiting for it. Returns a cancel function.
 */
export function afterPaint(fn: () => void): () => void {
  let timer = 0;
  const frame = requestAnimationFrame(() => { timer = window.setTimeout(fn, 0); });
  return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
}

/** NASA Black Marble 2016 night lights (GIBS, public domain), Web-Mercator tiles to zoom 8. */
export const LIGHTS_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';

const rad = Math.PI / 180;

/** Sun altitude (degrees) anywhere at one moment, from the subsolar point. */
export function sunAltitudeAt(t: number) {
  const s = subsolarPoint(t);
  const sd = Math.sin(s.lat * rad), cd = Math.cos(s.lat * rad);
  return (lat: number, lon: number) =>
    Math.asin(Math.sin(lat * rad) * sd + Math.cos(lat * rad) * cd * Math.cos((lon - s.lon) * rad)) / rad;
}

/** Night shade from the Sun's altitude: none in daylight, deepening through civil, nautical and astronomical twilight. */
export const nightShade = (alt: number) => Math.max(0, Math.min(1, -alt / 18));

/** Darkness for seeing aurora: none above −4°, full from −12° (as lib/tonight). */
const darkness = (alt: number) => (alt <= DARK_ALT ? 1 : alt >= -4 ? 0 : (-4 - alt) / (-4 - DARK_ALT));

/** Cloud cover (0–1) on an equirectangular grid, from the infrared world image behind the Clouds layer. */
export interface CloudGrid { w: number; h: number; data: Float32Array }

export async function loadCloudGrid(): Promise<CloudGrid | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `/api/clouds?world=1&t=${Math.floor(Date.now() / 9e5)}`;
    await img.decode();
    const w = 720, h = 360;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const data = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const v = Math.max(0, Math.min(1, (px[i * 4] - CLOUD_LO) / (CLOUD_HI - CLOUD_LO)));
      data[i] = v * v * (3 - 2 * v);
    }
    return { w, h, data };
  } catch { return null; }
}

const cloudAt = (g: CloudGrid, lat: number, lon: number) => {
  const x = Math.min(g.w - 1, Math.max(0, Math.floor(((lon + 180) / 360) * g.w)));
  const y = Math.min(g.h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * g.h)));
  return g.data[y * g.w + x];
};

/**
 * Where aurora, darkness and a clear sky come together now: 0–1, the product of an aurora factor
 * (OVATION probability, 5 % → 0, 40 % → 1), darkness and clear sky (unknown cloud counts as 0.7).
 */
export function bestScore(oval: Float32Array, clouds: CloudGrid | null, t: number) {
  const alt = sunAltitudeAt(t);
  return (lat: number, lon: number) => {
    const p = sampleOval(oval, lat, lon);
    if (p < 5) return 0;
    const a = Math.min(1, (p - 5) / 35);
    const d = darkness(alt(lat, lon));
    if (!d) return 0;
    const c = clouds ? 1 - cloudAt(clouds, lat, lon) : 0.7;
    return a * d * c;
  };
}

/** Best-spot colour: light blue, so it reads apart from the aurora's green-to-red scale. */
export const BEST_RGB: [number, number, number] = [127, 212, 255];
/** Opacity for a best-spot score: fades in from 0.1, full (0.75) from 0.5, so the zone has soft edges. */
export const bestAlpha = (s: number) => (s <= 0.1 ? 0 : 0.75 * Math.min(1, (s - 0.1) / 0.4));

/**
 * Paint a field into an equirectangular canvas (x = 0 at 180° W, y = 0 at 90° N), e.g. as a globe
 * texture: `fn` gives an RGBA colour (alpha 0–1) for a point, or null for nothing.
 */
export function paintEquirect(w: number, h: number, fn: (lat: number, lon: number) => [number, number, number, number] | null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) / h) * 180;
    for (let x = 0; x < w; x++) {
      const v = fn(lat, -180 + ((x + 0.5) / w) * 360);
      if (!v || v[3] <= 0) continue;
      const o = (y * w + x) * 4;
      img.data[o] = v[0]; img.data[o + 1] = v[1]; img.data[o + 2] = v[2]; img.data[o + 3] = Math.round(255 * v[3]);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** The same for the 2D map: a Web-Mercator canvas between ±latMax, as a data URL for an image overlay. */
export function paintMercator(w: number, latMax: number, fn: (lat: number, lon: number) => [number, number, number, number] | null) {
  const yMax = Math.log(Math.tan(Math.PI / 4 + (latMax * rad) / 2));
  const h = Math.round((w * 2 * yMax) / (2 * Math.PI));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    const y = yMax - ((py + 0.5) / h) * 2 * yMax;
    const lat = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / rad;
    for (let px = 0; px < w; px++) {
      const v = fn(lat, -180 + ((px + 0.5) / w) * 360);
      if (!v || v[3] <= 0) continue;
      const o = (py * w + px) * 4;
      img.data[o] = v[0]; img.data[o + 1] = v[1]; img.data[o + 2] = v[2]; img.data[o + 3] = Math.round(255 * v[3]);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
