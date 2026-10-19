/**
 * Augmented sky view (#92): where the camera points, and where the aurora, the Kp edge and the Moon sit
 * in the sky, as azimuth (degrees clockwise from north) and elevation (degrees above the horizon).
 */
import { magLat } from './astro';

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
export const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/**
 * Camera direction from a deviceorientation event (W3C frame: alpha about z, beta about x, gamma about y;
 * earth x east, y north, z up). The back camera looks along the device's −z axis. `roll` is how far
 * world-up leans from the top of the screen, clockwise in degrees, so the overlay turns with the horizon.
 * The azimuth is only meaningful when alpha is absolute (north-referenced).
 */
export function cameraPose(alpha: number, beta: number, gamma: number) {
  const [a, b, g] = [rad(alpha), rad(beta), rad(gamma)];
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  // −(third column of Rz·Rx·Ry): the back camera's direction in the earth frame.
  const vx = -(cA * sG + sA * sB * cG), vy = -(sA * sG - cA * sB * cG), vz = -(cB * cG);
  // Third row of Rz·Rx·Ry: world-up in device axes.
  const ux = -cB * sG, uy = sB, uz = cB * cG;
  void uz;
  return {
    az: (deg(Math.atan2(vx, vy)) + 360) % 360,
    el: deg(Math.asin(Math.max(-1, Math.min(1, vz)))),
    roll: deg(Math.atan2(ux, uy)),
  };
}

/** The point distKm away from (lat, lon) towards azimuth az, on a sphere. */
export function destination(lat: number, lon: number, az: number, distKm: number) {
  const d = distKm / R, p1 = rad(lat), t = rad(az);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = rad(lon) + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lon: wrap180(deg(l2)) };
}

/** Elevation (degrees) of a point heightKm up, distKm away along the ground (Earth's curve included). */
export function elevation(distKm: number, heightKm: number) {
  const th = distKm / R;
  return deg(Math.atan2((R + heightKm) * Math.cos(th) - R, (R + heightKm) * Math.sin(th)));
}

/** Aurora heights (km): green emission starts near 100 km; red tops reach about 250 km. */
export const AURORA_LOW = 100, AURORA_HIGH = 250;
/** OVATION probability (%) from which a direction counts as having aurora (where the map's colour scale starts). */
export const BAND_MIN = 5;
const STEP_KM = 25, MAX_KM = 1600;

export interface BandSlice { az: number; low: number; high: number; p: number }

/**
 * The aurora as seen from (lat, lon): for each azimuth step, the stretch of sky between the far edge of
 * the oval (at the lowest emission height) and its near edge (at the highest), with the strongest
 * probability on that line. Overhead when the place is inside the oval.
 */
export function auroraBand(sample: (lat: number, lon: number) => number, lat: number, lon: number, stepDeg = 5): BandSlice[] {
  const out: BandSlice[] = [];
  for (let az = 0; az < 360; az += stepDeg) {
    let near = -1, far = -1, p = 0;
    for (let d = 0; d <= MAX_KM; d += STEP_KM) {
      const q = destination(lat, lon, az, d);
      const v = sample(q.lat, q.lon);
      if (v >= BAND_MIN) { if (near < 0) near = d; far = d; p = Math.max(p, v); }
    }
    if (near < 0) continue;
    out.push({ az, low: elevation(far, AURORA_LOW), high: near === 0 ? 90 : elevation(near, AURORA_HIGH), p });
  }
  return out;
}

/**
 * The equatorward edge of the oval at a Kp (66° − 2·Kp magnetic latitude, as lib/astro) seen at the
 * lowest emission height: one elevation per azimuth step where the edge lies within range.
 */
export function kpEdge(kp: number, lat: number, lon: number, stepDeg = 5): { az: number; el: number }[] {
  const edge = 66 - 2 * kp, out: { az: number; el: number }[] = [];
  const inside = Math.abs(magLat(lat, lon)) >= edge;
  for (let az = 0; az < 360; az += stepDeg) {
    for (let d = STEP_KM; d <= MAX_KM; d += STEP_KM) {
      const q = destination(lat, lon, az, d);
      if ((Math.abs(magLat(q.lat, q.lon)) >= edge) !== inside) { out.push({ az, el: elevation(d, AURORA_LOW) }); break; }
    }
  }
  return out;
}

/** Compass point names for an azimuth, in 16 steps (N, NNE, NE, …). */
export const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;
export const point16 = (az: number) => POINTS16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

/** Where the band is strongest: its azimuth and that slice. */
export function bandPeak(band: BandSlice[]) {
  return band.reduce<BandSlice | null>((a, b) => (!a || b.p > a.p ? b : a), null);
}
