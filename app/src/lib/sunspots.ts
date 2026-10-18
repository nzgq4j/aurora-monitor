/**
 * Sunspot regions (#41): NOAA SWPC's active-region list placed on the solar disc. Positions are
 * heliographic latitude and distance from the central meridian at NOAA's report time (24:00 UT on
 * the observed date); they are rotated forward to now with the Sun's differential rotation and projected
 * with the Sun's tilt towards Earth (B0). SDO's browse images have solar north up, west to the right.
 */

export interface Region {
  region: number;
  /** Heliographic latitude, ° (north positive). */
  lat: number;
  /** Distance from the central meridian at report time, ° (west positive). */
  cmd: number;
  /** Report time (ms): 24:00 UT on NOAA's observed date. */
  at: number;
  spots: number | null;
  /** NOAA magnetic class: A, B, BG, BGD, BD, G, GD… */
  mag: string | null;
  /** McIntosh class, e.g. Eac. */
  mcintosh: string | null;
  area: number | null;
  /** Flare probabilities for the next day, %. */
  flare: { c: number | null; m: number | null; x: number | null };
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Heliographic latitude of the disc centre seen from Earth, ° (between about −7.25 and +7.25). */
export function solarB0(t: number): number {
  const d = t / 864e5 - 10957.5; // days since J2000.0
  const g = rad(357.529 + 0.98560028 * d);
  const lambda = rad(280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const jd = t / 864e5 + 2440587.5;
  const node = rad(73.6667 + (1.3958333 * (jd - 2396758)) / 36525);
  return deg(Math.asin(Math.sin(lambda - node) * Math.sin(rad(7.25))));
}

/** Synodic (as seen from Earth) rotation rate at a latitude, °/day: faster at the equator. */
export const synodicRate = (lat: number) => {
  const s2 = Math.sin(rad(lat)) ** 2;
  return 14.713 - 2.396 * s2 - 1.787 * s2 * s2 - 0.9856;
};

/**
 * Where a region is on the disc at time t: x right (west), y up (north), in solar radii; `front`
 * false once it has rotated round the west limb.
 */
export function project(r: Pick<Region, 'lat' | 'cmd' | 'at'>, t: number, b0 = solarB0(t)) {
  const L = rad(r.cmd + synodicRate(r.lat) * ((t - r.at) / 864e5));
  const B = rad(r.lat), B0 = rad(b0);
  const x = Math.cos(B) * Math.sin(L);
  const y = Math.sin(B) * Math.cos(B0) - Math.cos(B) * Math.cos(L) * Math.sin(B0);
  const z = Math.cos(B) * Math.cos(L) * Math.cos(B0) + Math.sin(B) * Math.sin(B0);
  return { x, y, front: z > 0.05 };
}

/** NOAA magnetic class as Mount Wilson letters (α, β, γ, δ). */
export const magGreek = (m: string | null) =>
  !m ? '—' : m.replace(/A/g, 'α').replace(/B/g, 'β').replace(/G/g, 'γ').replace(/D/g, 'δ').split('').join('-');

/** Flare risk from magnetic complexity: δ high, γ elevated, otherwise low. */
export const magRisk = (m: string | null): 'high' | 'elevated' | 'low' | null =>
  !m ? null : m.includes('D') ? 'high' : m.includes('G') ? 'elevated' : 'low';

export interface LabelSpot { id: number; x: number; y: number }
export interface PlacedLabel extends LabelSpot { lx: number; ly: number; anchor: 'start' | 'end'; moved: boolean }

/**
 * Place region numbers beside their spots (all in image fractions) without overlapping: each label
 * goes to the side away from the nearer limb, then steps down or up by its own height until it clears
 * the labels already placed. `size` is the font size; labels are about 0.62·size per digit wide.
 */
export function layoutLabels(spots: LabelSpot[], size: number, cx = 0.5): PlacedLabel[] {
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const gap = size * 0.7, h = size * 1.15;
  const steps = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  return [...spots].sort((a, b) => a.y - b.y || a.x - b.x).map(s => {
    const anchor: 'start' | 'end' = s.x <= cx + 0.2 ? 'start' : 'end';
    const w = String(s.id).length * size * 0.62;
    const x0 = anchor === 'start' ? s.x + gap : s.x - gap - w, x1 = x0 + w;
    let ly = s.y, k = 0;
    for (const step of steps) {
      ly = s.y + step * h;
      const y0 = ly - h / 2, y1 = ly + h / 2;
      if (!boxes.some(b => x0 < b.x1 && b.x0 < x1 && y0 < b.y1 && b.y0 < y1)) { k = step; break; }
    }
    boxes.push({ x0, x1, y0: ly - h / 2, y1: ly + h / 2 });
    return { ...s, lx: anchor === 'start' ? x0 : x1, ly, anchor, moved: k !== 0 };
  });
}
