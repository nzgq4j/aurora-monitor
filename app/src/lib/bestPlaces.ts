/**
 * Named towns and cities where aurora is most likely to be seen right now (#54): places from the
 * bundled high-latitude gazetteer (Natural Earth populated places, ≥ 42° N/S, public domain) scored
 * like the Best spots layer (aurora × darkness × clear sky), then thinned so labels don't collide.
 */

/** [name, country, lat, lon, population], largest first (public/geo/places-hi.json). */
export type PlaceRow = [string, string, number, number, number];

export interface BestPlace { name: string; country: string; lat: number; lon: number; pop: number; score: number }

let rows: Promise<PlaceRow[]> | null = null;
export function loadPlaces(): Promise<PlaceRow[]> {
  rows ??= fetch('/geo/places-hi.json').then(r => (r.ok ? r.json() : Promise.reject())).catch(() => { rows = null; return []; });
  return rows;
}

/** Places scoring at least 0.15 and within 60 % of the best place's score, best first. */
export function bestCandidates(places: PlaceRow[], score: (lat: number, lon: number) => number): BestPlace[] {
  const all: BestPlace[] = [];
  for (const [name, country, lat, lon, pop] of places) {
    const s = score(lat, lon);
    if (s >= 0.15) all.push({ name, country, lat, lon, pop: Math.max(0, pop), score: s });
  }
  const top = all.reduce((m, p) => Math.max(m, p.score), 0);
  return all.filter(p => p.score >= 0.6 * top).sort((a, b) => b.score - a.score);
}

const R = 6371;
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Cities of at least this population; smaller places count as towns. */
const CITY = 20000;

/**
 * Up to `limit` places at least `minKm` apart: the largest cities first, with about a third of the
 * slots kept for small towns (best score first), so every region gets familiar names and local spots.
 */
export function thinPlaces(cands: BestPlace[], limit: number, minKm: number): BestPlace[] {
  const picked: BestPlace[] = [];
  const room = (p: BestPlace) => picked.every(q => km(p, q) >= minKm);
  const towns = Math.max(2, Math.floor(limit / 3));
  for (const p of cands.filter(c => c.pop >= CITY).sort((a, b) => b.pop - a.pop)) {
    if (picked.length >= limit - towns) break;
    if (room(p)) picked.push(p);
  }
  for (const p of cands.filter(c => c.pop < CITY)) {
    if (picked.length >= limit) break;
    if (room(p)) picked.push(p);
  }
  // Fill any slots towns didn't use with further cities.
  for (const p of cands.filter(c => c.pop >= CITY).sort((a, b) => b.pop - a.pop)) {
    if (picked.length >= limit) break;
    if (!picked.includes(p) && room(p)) picked.push(p);
  }
  return picked;
}

/** Label spacing on the 2D map at a zoom level: about 260 km at zoom 3, halving with each level. */
export const spacingKm = (zoom: number) => 260 * 2 ** (3 - zoom);
