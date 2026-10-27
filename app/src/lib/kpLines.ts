import { magLat, magLocalTime, ovalShift } from './astro';

// Light blue → green → yellow → red, for the Kp reach lines (the aurora itself uses lib/auroraColor).
const STOPS: [number, [number, number, number]][] = [
  [0, [127, 212, 255]], [0.33, [89, 255, 58]], [0.66, [255, 225, 77]], [1, [255, 77, 77]],
];
function ramp(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i], [t0, c0] = STOPS[i - 1];
    if (x <= t1) { const k = (x - t0) / (t1 - t0); return [0, 1, 2].map(j => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number]; }
  }
  return STOPS[STOPS.length - 1][1];
}
export const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const kpT = (k: number) => (k - 1) / 8;

/**
 * Geographic line where geomagnetic latitude equals the oval's equatorward edge for this Kp (≈ 66° − 2·Kp
 * near magnetic midnight). With a time `t`, the edge also follows the oval's daily shape: furthest from
 * the pole around midnight and drawn in by up to 6° towards the day side (see ovalShift), as the aurora is.
 */
export function kpLine(k: number, south = false, t?: number): [number, number][] {
  const edge = (lat: number, lon: number) => (66 - 2 * k + (t === undefined ? 0 : ovalShift(magLocalTime(lat, lon, t)))) * (south ? -1 : 1);
  const pts: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    let lo = south ? -89.9 : 0, hi = south ? 0 : 89.9;
    for (let n = 0; n < 40; n++) {
      const mid = (lo + hi) / 2;
      if (magLat(mid, lon) < edge(mid, lon)) lo = mid; else hi = mid;
    }
    pts.push([(lo + hi) / 2, lon]);
  }
  return pts;
}

/** Colour of the Kp k reach line. */
export const kpColor = (k: number) => ramp(kpT(k));
