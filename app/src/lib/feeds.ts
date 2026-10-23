// Server-side fetchers for public space-weather feeds. Every fetch is cached by
// Next.js and revalidated on an interval, so pages stay static-fast while the
// data stays current. Any feed can fail independently; callers get `null`/[]
// for that piece and render an "unavailable" state rather than fake values.

import { OVAL_SCALE, sampleOval, smoothOval } from './ovalSmooth';

const SWPC = 'https://services.swpc.noaa.gov';
const GFZ = 'https://kp.gfz.de/app/json/';

/** Revalidate windows in seconds. */
const FAST = 120;
const SLOW = 3600;

type Row = Record<string, unknown>;

async function getJson(url: string, revalidate: number): Promise<unknown | null> {
  try {
    const res = await fetch(url, { next: { revalidate }, headers: { 'User-Agent': 'polarlights.io (aurora forecasts)' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getText(url: string, revalidate: number): Promise<string | null> {
  try {
    const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(10_000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/**
 * SWPC "products" JSON is an array of arrays whose first row is the header;
 * some products are arrays of objects. Normalise both to objects.
 */
function rows(json: unknown): Row[] {
  if (!Array.isArray(json) || json.length === 0) return [];
  if (Array.isArray(json[0])) {
    const [head, ...body] = json as unknown[][];
    return body.map(r => Object.fromEntries(head.map((h, i) => [String(h).toLowerCase(), r[i]])));
  }
  return (json as Row[]).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])));
}

/** SWPC time tags are UTC without a zone ("2026-10-16 21:00:00.000"). */
export function parseTime(v: unknown): number | null {
  if (typeof v !== 'string' || !v) return null;
  let s = v.trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const latest = <T extends { t: number }>(xs: T[], ok: (x: T) => boolean) => {
  for (let i = xs.length - 1; i >= 0; i--) if (ok(xs[i])) return xs[i];
  return null;
};

// ---------------------------------------------------------------------------

export type KpKind = 'observed' | 'estimated' | 'predicted';
export interface KpPoint { t: number; kp: number; kind: KpKind }

/** Observed, estimated and predicted 3-hour Kp from the NOAA forecast product. */
export async function kpSeries(): Promise<KpPoint[]> {
  const data = rows(await getJson(`${SWPC}/products/noaa-planetary-k-index-forecast.json`, FAST));
  return data.flatMap(r => {
    const t = parseTime(r.time_tag);
    const kp = num(r.kp);
    const raw = String(r.observed ?? '').toLowerCase();
    const kind: KpKind = raw.startsWith('obs') ? 'observed' : raw.startsWith('est') ? 'estimated' : 'predicted';
    return t !== null && kp !== null ? [{ t, kp, kind }] : [];
  }).sort((a, b) => a.t - b.t);
}

/** Most recent planetary Kp (observed or estimated). */
export async function kpNow(): Promise<{ t: number; kp: number } | null> {
  const data = rows(await getJson(`${SWPC}/products/noaa-planetary-k-index.json`, FAST))
    .map(r => ({ t: parseTime(r.time_tag) ?? 0, kp: num(r.kp ?? r.kp_index) ?? NaN }));
  return latest(data, x => x.t > 0 && Number.isFinite(x.kp));
}

export interface SolarWind { t: number; bz: number | null; bt: number | null; speed: number | null; density: number | null }

/** First non-empty row set from a list of candidate URLs (SWPC has moved these products before). */
async function firstRows(urls: string[], revalidate: number): Promise<Row[]> {
  for (const u of urls) {
    const r = rows(await getJson(u, revalidate));
    if (r.length) return r;
  }
  return [];
}

/** Real-time products mix spacecraft; when an "active" flag is present keep only the active source. */
const activeOnly = (rs: Row[]) => (rs.some(r => 'active' in r) ? rs.filter(r => r.active === true || r.active === 'true' || r.active === 1) : rs);

/** Latest real-time solar wind at L1 (DSCOVR/ACE). */
export async function solarWind(): Promise<SolarWind | null> {
  const [mag, plasma] = await Promise.all([
    firstRows([`${SWPC}/products/solar-wind/mag-2-hour.json`, `${SWPC}/products/solar-wind/mag-1-day.json`, `${SWPC}/json/rtsw/rtsw_mag_1m.json`], FAST).then(activeOnly),
    firstRows([`${SWPC}/products/solar-wind/plasma-2-hour.json`, `${SWPC}/products/solar-wind/plasma-1-day.json`, `${SWPC}/json/rtsw/rtsw_wind_1m.json`], FAST).then(activeOnly),
  ]);
  const m = latest(mag.map(r => ({ t: parseTime(r.time_tag) ?? 0, bz: num(r.bz_gsm ?? r.bz), bt: num(r.bt) })).sort((a, b) => a.t - b.t), x => x.t > 0 && x.bz !== null);
  const p = latest(plasma.map(r => ({ t: parseTime(r.time_tag) ?? 0, speed: num(r.speed ?? r.proton_speed), density: num(r.density ?? r.proton_density) })).sort((a, b) => a.t - b.t), x => x.t > 0 && x.speed !== null);
  if (!m && !p) return null;
  return { t: Math.max(m?.t ?? 0, p?.t ?? 0), bz: m?.bz ?? null, bt: m?.bt ?? null, speed: p?.speed ?? null, density: p?.density ?? null };
}

/** Latest northern-hemisphere power (GW) from the OVATION nowcast text product. */
export async function hemiPower(): Promise<{ t: number; north: number } | null> {
  const txt = await getText(`${SWPC}/text/aurora-nowcast-hemi-power.txt`, FAST);
  if (!txt) return null;
  let out: { t: number; north: number } | null = null;
  for (const line of txt.split('\n')) {
    // "2026-10-16_22:15   2026-10-16_22:50      45      50"
    const m = line.trim().match(/^(\d{4}-\d\d-\d\d)_(\d\d:\d\d)\s+\S+\s+(\d+)\s+(\d+)/);
    if (m) out = { t: Date.parse(`${m[1]}T${m[2]}:00Z`), north: +m[3] };
  }
  return out;
}

export interface WindPoint { t: number; by: number | null; bz: number | null; bt: number | null; speed: number | null; density: number | null }

/** Last 24 hours of real-time solar wind at L1, averaged into 5-minute bins. */
export async function solarWindSeries(): Promise<WindPoint[]> {
  const [mag, plasma] = await Promise.all([
    firstRows([`${SWPC}/products/solar-wind/mag-1-day.json`, `${SWPC}/json/rtsw/rtsw_mag_1m.json`], FAST).then(activeOnly),
    firstRows([`${SWPC}/products/solar-wind/plasma-1-day.json`, `${SWPC}/json/rtsw/rtsw_wind_1m.json`], FAST).then(activeOnly),
  ]);
  const BIN = 3e5;
  const bins = new Map<number, Record<'by' | 'bz' | 'bt' | 'speed' | 'density', number[]>>();
  const add = (t: number | null, key: 'by' | 'bz' | 'bt' | 'speed' | 'density', v: number | null) => {
    if (t === null || v === null) return;
    const k = Math.floor(t / BIN) * BIN;
    let b = bins.get(k);
    if (!b) bins.set(k, (b = { by: [], bz: [], bt: [], speed: [], density: [] }));
    b[key].push(v);
  };
  for (const r of mag) { const t = parseTime(r.time_tag); add(t, 'by', num(r.by_gsm ?? r.by)); add(t, 'bz', num(r.bz_gsm ?? r.bz)); add(t, 'bt', num(r.bt)); }
  for (const r of plasma) { const t = parseTime(r.time_tag); add(t, 'speed', num(r.speed ?? r.proton_speed)); add(t, 'density', num(r.density ?? r.proton_density)); }
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
  const out = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => ({ t, by: mean(b.by), bz: mean(b.bz), bt: mean(b.bt), speed: mean(b.speed), density: mean(b.density) }));
  const end = out.length ? out[out.length - 1].t : 0;
  return out.filter(p => p.t > end - 864e5);
}

export interface HemiPoint { t: number; observed: number; north: number; south: number }

/** OVATION hemispheric power (GW) for the last day, stamped at each value's forecast time. */
export async function hemiPowerSeries(): Promise<HemiPoint[]> {
  const txt = await getText(`${SWPC}/text/aurora-nowcast-hemi-power.txt`, FAST);
  if (!txt) return [];
  const out: HemiPoint[] = [];
  for (const line of txt.split('\n')) {
    const m = line.trim().match(/^(\d{4}-\d\d-\d\d)_(\d\d:\d\d)\s+(\d{4}-\d\d-\d\d)_(\d\d:\d\d)\s+(\d+)\s+(\d+)/);
    if (m) out.push({ observed: Date.parse(`${m[1]}T${m[2]}:00Z`), t: Date.parse(`${m[3]}T${m[4]}:00Z`), north: +m[5], south: +m[6] });
  }
  out.sort((a, b) => a.t - b.t);
  const end = out.length ? out[out.length - 1].t : 0;
  return out.filter(p => p.t > end - 864e5);
}

export interface Oval {
  observed: number | null;
  forecast: number | null;
  /** [lon 0..359 east, lat -90..90] -> probability 0..100, indexed [lat + 90][lon]. */
  grid: Uint8Array[];
}

/** OVATION Prime 30–90 minute aurora probability forecast on a 1° grid. */
export async function ovation(): Promise<Oval | null> {
  const json = await getJson(`${SWPC}/json/ovation_aurora_latest.json`, FAST) as Row | null;
  const coords = json && Array.isArray(json.coordinates) ? json.coordinates as number[][] : null;
  if (!coords?.length) return null;
  const grid = Array.from({ length: 181 }, () => new Uint8Array(360));
  for (const c of coords) {
    const [lon, lat, v] = c;
    if (lat >= -90 && lat <= 90 && lon >= 0 && lon < 360) grid[Math.round(lat) + 90][Math.round(lon) % 360] = Math.max(0, Math.min(100, Math.round(v)));
  }
  return { observed: parseTime(json?.['Observation Time']), forecast: parseTime(json?.['Forecast Time']), grid };
}

/** Probability at a point, and the best value within `reach` degrees poleward (visible low on the horizon). */
export function ovalAt(oval: Oval, lat: number, lon: number, reach = 6) {
  const lo = ((Math.round(lon) % 360) + 360) % 360;
  const at = (la: number) => oval.grid[Math.max(0, Math.min(180, Math.round(la) + 90))][lo];
  const dir = lat >= 0 ? 1 : -1;
  let nearby = 0;
  for (let d = 0; d <= reach; d++) nearby = Math.max(nearby, at(lat + dir * d));
  return { overhead: at(lat), nearby };
}

/** The smoothed OVATION field (see lib/ovalSmooth), computed once per grid. */
const fields = new WeakMap<Oval, Float32Array>();
function ovalField(oval: Oval): Float32Array {
  let field = fields.get(oval);
  if (!field) {
    const flat = new Uint8Array(181 * 360);
    oval.grid.forEach((row, i) => flat.set(row, i * 360));
    field = smoothOval(flat);
    fields.set(oval, field);
  }
  return field;
}

/** Thinned northern-hemisphere points for the polar map, from the same smoothed field as the maps. */
export function ovalPoints(oval: Oval, minLat = 35, step = 2, min = 3): [number, number, number][] {
  const field = ovalField(oval);
  const pts: [number, number, number][] = [];
  for (let lat = minLat; lat <= 90; lat += 1) {
    for (let lon = 0; lon < 360; lon += step) {
      const v = Math.round(sampleOval(field, lat, lon));
      if (v >= min) pts.push([lon, lat, v]);
    }
  }
  return pts;
}

/**
 * Equatorward edge of the smoothed probability >= threshold %, northern hemisphere, as runs of [lon, lat].
 * Each longitude takes the lowest latitude where the field reaches the threshold (interpolated within
 * the 0.25 degree step). Where no latitude reaches it, the line breaks rather than cutting across; a single
 * unbroken run is returned closed (its first point repeated at the end).
 */
export function ovalEdge(oval: Oval, threshold = 10, step = 2): [number, number][][] {
  const field = ovalField(oval);
  const dLat = 1 / OVAL_SCALE;
  const at: ([number, number] | null)[] = [];
  for (let lon = 0; lon < 360; lon += step) {
    let hit: [number, number] | null = null;
    let prev = sampleOval(field, 35, lon);
    for (let lat = 35 + dLat; lat <= 88; lat += dLat) {
      const v = sampleOval(field, lat, lon);
      if (v >= threshold) { hit = [lon, prev >= threshold ? lat : lat - (dLat * (v - threshold)) / (v - prev)]; break; }
      prev = v;
    }
    at.push(hit);
  }
  const gap = at.findIndex(p => !p);
  if (gap < 0) return at.length > 2 ? [[...(at as [number, number][]), at[0] as [number, number]]] : [];
  // Start just after a gap so a run that crosses 0 degrees longitude stays in one piece.
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  for (let i = 1; i <= at.length; i++) {
    const p = at[(gap + i) % at.length];
    if (p) run.push(p);
    else { if (run.length > 1) runs.push(run); run = []; }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

// ---------------------------------------------------------------------------

export interface KpDay { t: number; kpMax: number }

/** Definitive/nowcast Kp history from GFZ Potsdam (the official Kp source), as 3-hour values. */
export async function gfzKp(days: number): Promise<{ t: number; kp: number }[]> {
  const end = new Date(); end.setUTCHours(23, 59, 59, 0);
  const start = new Date(end.getTime() - days * 864e5); start.setUTCHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const json = await getJson(`${GFZ}?start=${iso(start)}&end=${iso(end)}&index=Kp`, SLOW) as Row | null;
  const ts = json && Array.isArray(json.datetime) ? json.datetime as string[] : [];
  const ks = json && Array.isArray(json.Kp) ? json.Kp as number[] : [];
  return ts.map((t, i) => ({ t: Date.parse(t), kp: ks[i] })).filter(x => Number.isFinite(x.t) && typeof x.kp === 'number' && x.kp >= 0);
}

/**
 * Backup for gfzKp: NOAA SWPC's last 30 days of planetary Kp (estimated), as 3-hour values. Each line
 * is "2026 10 20  A  K×8  A  K×8  Ap  Kp×8"; the last eight decimals are the planetary Kp, -1 for
 * periods still to come.
 */
export async function noaaKp(): Promise<{ t: number; kp: number }[]> {
  const txt = await getText(`${SWPC}/text/daily-geomagnetic-indices.txt`, SLOW);
  if (!txt) return [];
  const out: { t: number; kp: number }[] = [];
  for (const line of txt.split('\n')) {
    const d = line.match(/^(\d{4}) (\d{2}) (\d{2})\s/);
    const ks = line.match(/-?\d+\.\d+/g);
    if (!d || !ks || ks.length < 8) continue;
    const day = Date.UTC(+d[1], +d[2] - 1, +d[3]);
    ks.slice(-8).forEach((k, i) => { const kp = +k; if (kp >= 0) out.push({ t: day + i * 3 * 36e5, kp }); });
  }
  return out;
}

/** Group 3-hour Kp into UTC-day maxima. */
export function dailyMax(xs: { t: number; kp: number }[]): KpDay[] {
  const by = new Map<number, number>();
  for (const x of xs) {
    const d = Math.floor(x.t / 864e5) * 864e5;
    by.set(d, Math.max(by.get(d) ?? 0, x.kp));
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([t, kpMax]) => ({ t, kpMax }));
}

export interface OutlookDay { t: number; flux: number; ap: number; kp: number }

/** NOAA 27-day outlook: daily 10.7 cm flux, Ap and largest Kp. */
export async function outlook27(): Promise<OutlookDay[]> {
  const txt = await getText(`${SWPC}/text/27-day-outlook.txt`, SLOW);
  if (!txt) return [];
  const out: OutlookDay[] = [];
  for (const line of txt.split('\n')) {
    // "2026 Oct 19     140          12          4"
    const m = line.trim().match(/^(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (m) {
      const t = Date.parse(`${m[3]} ${m[2]} ${m[1]} 00:00:00 UTC`);
      if (Number.isFinite(t)) out.push({ t, flux: +m[4], ap: +m[5], kp: +m[6] });
    }
  }
  return out;
}

/** Whole OVATION grid as base64 bytes, row-major from lat -90 to 90, lon 0..359 east. */
export function ovalGridBase64(oval: Oval): string {
  const bytes = new Uint8Array(181 * 360);
  oval.grid.forEach((row, i) => bytes.set(row, i * 360));
  return Buffer.from(bytes).toString('base64');
}

/** GOES 0.1–0.8 nm X-ray flux (W/m²), 1-minute values for the last 6 hours: the flare class scale. */
export async function xrayRecent(): Promise<{ t: number; flux: number }[]> {
  const json = await getJson(`${SWPC}/json/goes/primary/xrays-6-hour.json`, 60);
  return rows(json).flatMap(r => {
    const t = parseTime(r.time_tag), flux = num(r.flux);
    return r.energy === '0.1-0.8nm' && t !== null && flux !== null && flux > 0 ? [{ t, flux }] : [];
  });
}

/** GFZ Potsdam's half-hourly Hp30 index for the last 6 hours (Kp's scale, open-ended above 9), each stamped at its start. */
export async function hp30Recent(): Promise<{ t: number; hp: number }[]> {
  const end = new Date(), start = new Date(end.getTime() - 6 * 36e5);
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const json = await getJson(`${GFZ}?start=${iso(start)}&end=${iso(end)}&index=Hp30`, FAST) as Row | null;
  const ts = Array.isArray(json?.datetime) ? json!.datetime as string[] : [];
  const vs = Array.isArray(json?.Hp30) ? json!.Hp30 as number[] : [];
  return ts.flatMap((s, i) => (typeof vs[i] === 'number' && vs[i] >= 0 ? [{ t: Date.parse(s), hp: vs[i] }] : []));
}

/** NASA DONKI's WSA-Enlil CME runs for the last week, from CCMC directly, else through api.nasa.gov; null if neither answers. */
export async function enlilSims(): Promise<Row[] | null> {
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const direct = await getJson(`https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/WSAEnlilSimulations?startDate=${from}`, SLOW);
  if (Array.isArray(direct)) return direct as Row[];
  const viaApi = await getJson(`https://api.nasa.gov/DONKI/WSAEnlilSimulations?startDate=${from}&api_key=${process.env.NASA_API_KEY || 'DEMO_KEY'}`, SLOW);
  return Array.isArray(viaApi) ? viaApi as Row[] : null;
}
