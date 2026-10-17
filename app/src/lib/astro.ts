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
 * latitude, and it can be seen ~2° beyond that.
 */
export function kpNeeded(lat: number, lon: number): number {
  const m = Math.abs(magLat(lat, lon));
  return Math.max(0, Math.min(9, Math.ceil((66 - m - 2) / 2)));
}

export const G_SCALE = (kp: number) => (kp >= 9 ? 5 : kp >= 8 ? 4 : kp >= 7 ? 3 : kp >= 6 ? 2 : kp >= 5 ? 1 : 0);
