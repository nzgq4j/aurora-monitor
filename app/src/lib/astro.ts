// Small, dependency-free astronomy helpers used for viewing conditions.

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Solar altitude in degrees (low-precision almanac algorithm, ~0.1° accuracy). */
export function sunAltitude(t: number, lat: number, lon: number): number {
  const d = t / 864e5 - 10957.5; // days since J2000.0
  const g = rad(357.529 + 0.98560028 * d);
  const q = 280.459 + 0.98564736 * d;
  const L = rad(q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const e = rad(23.439 - 0.00000036 * d);
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const H = rad(gmst * 15 + lon) - ra;
  return deg(Math.asin(Math.sin(rad(lat)) * Math.sin(dec) + Math.cos(rad(lat)) * Math.cos(dec) * Math.cos(H)));
}

/** Sky is dark enough for aurora once the Sun is 12° below the horizon (nautical twilight). */
export const DARK_ALT = -12;

/** Whether it is dark now, and when that next changes (searching up to 36 h ahead in 5-minute steps). */
export function darkness(t: number, lat: number, lon: number) {
  const dark = sunAltitude(t, lat, lon) <= DARK_ALT;
  for (let s = t + 3e5; s <= t + 36 * 36e5; s += 3e5) {
    if ((sunAltitude(s, lat, lon) <= DARK_ALT) !== dark) return { dark, changesAt: s };
  }
  return { dark, changesAt: null as number | null }; // polar day/night
}

/** Approximate north geomagnetic dipole pole (IGRF, 2025 epoch). */
const POLE = { lat: 80.8, lon: -72.6 };

/** Geomagnetic (dipole) latitude in degrees. */
export function magLat(lat: number, lon: number): number {
  const s = Math.sin(rad(lat)) * Math.sin(rad(POLE.lat)) + Math.cos(rad(lat)) * Math.cos(rad(POLE.lat)) * Math.cos(rad(lon - POLE.lon));
  return deg(Math.asin(s));
}

/**
 * Rough Kp at which aurora becomes visible low on the poleward horizon.
 * Rule of thumb: the oval's equatorward edge sits near 66° − 2·Kp magnetic
 * latitude, and it can be seen low on the horizon from ~3° beyond that.
 */
export function kpNeeded(lat: number, lon: number): number {
  const m = Math.abs(magLat(lat, lon));
  return Math.max(0, Math.min(9, Math.ceil((66 - m - 3) / 2)));
}

export const G_SCALE = (kp: number) => (kp >= 9 ? 5 : kp >= 8 ? 4 : kp >= 7 ? 3 : kp >= 6 ? 2 : kp >= 5 ? 1 : 0);

// ---------------------------------------------------------------------------
// Moon: low-precision position and phase (after Meeus / SunCalc), good to about a degree,
// which is plenty for "is the Moon up and how bright is it".

const sunCoords = (d: number) => {
  const g = rad(357.529 + 0.98560028 * d);
  const L = rad(280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const e = rad(23.439 - 0.00000036 * d);
  return { ra: Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec: Math.asin(Math.sin(e) * Math.sin(L)), dist: 149598000 };
};

const moonCoords = (d: number) => {
  const L = rad(218.316 + 13.176396 * d), M = rad(134.963 + 13.064993 * d), F = rad(93.272 + 13.22935 * d);
  const l = L + rad(6.289) * Math.sin(M), b = rad(5.128) * Math.sin(F);
  const e = rad(23.4397);
  return {
    ra: Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)),
    dec: Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)),
    dist: 385001 - 20905 * Math.cos(M),
  };
};

/** Moon altitude in degrees. */
export function moonAltitude(t: number, lat: number, lon: number): number {
  const d = t / 864e5 - 10957.5;
  const m = moonCoords(d);
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const H = rad(gmst * 15 + lon) - m.ra;
  return deg(Math.asin(Math.sin(rad(lat)) * Math.sin(m.dec) + Math.cos(rad(lat)) * Math.cos(m.dec) * Math.cos(H)));
}

const PHASES: [number, string][] = [
  [0.03, 'New moon'], [0.22, 'Waxing crescent'], [0.28, 'First quarter'], [0.47, 'Waxing gibbous'],
  [0.53, 'Full moon'], [0.72, 'Waning gibbous'], [0.78, 'Last quarter'], [0.97, 'Waning crescent'], [1.01, 'New moon'],
];

export interface MoonState {
  /** Lit fraction of the disc, 0–1. */
  illumination: number;
  /** Position in the cycle: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  phase: number;
  name: string;
  waxing: boolean;
  altitude: number;
  up: boolean;
  /** Next moonrise or moonset within 36 h, whichever comes first. */
  next: { t: number; event: 'rise' | 'set' } | null;
}

export function moon(t: number, lat: number, lon: number): MoonState {
  const d = t / 864e5 - 10957.5;
  const s = sunCoords(d), m = moonCoords(d);
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(s.dist * Math.sin(phi), m.dist - s.dist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  const phase = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;
  const altitude = moonAltitude(t, lat, lon);
  const up = altitude > 0;
  let next: MoonState['next'] = null;
  for (let x = t + 6e5; x <= t + 36 * 36e5; x += 6e5) {
    if ((moonAltitude(x, lat, lon) > 0) !== up) { next = { t: x, event: up ? 'set' : 'rise' }; break; }
  }
  return {
    illumination: (1 + Math.cos(inc)) / 2,
    phase,
    name: PHASES.find(([p]) => phase < p)![1],
    waxing: phase < 0.5,
    altitude, up, next,
  };
}
