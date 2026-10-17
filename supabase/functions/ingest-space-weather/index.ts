// Ingests public space-weather data into the archive tables.
// Scheduled by pg_cron (see migrations/20261017000200_ingest_schedule.sql).
// Uses the service role, which the Edge runtime provides as an env var.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const SWPC = 'https://services.swpc.noaa.gov';
type Row = Record<string, unknown>;

async function json(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'polarlights.io ingest' } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function text(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** SWPC products are arrays of arrays with a header row, or arrays of objects. */
function rows(j: unknown): Row[] {
  if (!Array.isArray(j) || !j.length) return [];
  if (Array.isArray(j[0])) {
    const [h, ...b] = j as unknown[][];
    return b.map(r => Object.fromEntries(h.map((k, i) => [String(k).toLowerCase(), r[i]])));
  }
  return (j as Row[]).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])));
}

async function firstRows(urls: string[]) {
  for (const u of urls) {
    const r = rows(await json(u));
    if (r.length) return r;
  }
  return [];
}

function iso(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  let s = v.trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const detail: Record<string, unknown> = {};

  // 1. SWPC Kp: observed, estimated and predicted.
  const kpRows = rows(await json(`${SWPC}/products/noaa-planetary-k-index-forecast.json`)).flatMap(r => {
    const t = iso(r.time_tag), kp = num(r.kp);
    return t && kp !== null ? [{ time_tag: t, source: 'swpc', kp, status: String(r.observed ?? '') || null }] : [];
  });
  if (kpRows.length) {
    const { error } = await sb.from('kp_index').upsert(kpRows);
    detail.swpc_kp = error ? error.message : kpRows.length;
  } else detail.swpc_kp = 'no data';

  // 2. GFZ Potsdam definitive/nowcast Kp for the last 3 days.
  const end = new Date(), start = new Date(end.getTime() - 3 * 864e5);
  const z = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const g = await json(`https://kp.gfz.de/app/json/?start=${z(start)}&end=${z(end)}&index=Kp`) as Row | null;
  const gt = Array.isArray(g?.datetime) ? g!.datetime as string[] : [];
  const gk = Array.isArray(g?.Kp) ? g!.Kp as number[] : [];
  const gs = Array.isArray(g?.status) ? g!.status as string[] : [];
  const gfzRows = gt.flatMap((t, i) => (typeof gk[i] === 'number' && gk[i] >= 0 ? [{ time_tag: new Date(t).toISOString(), source: 'gfz', kp: gk[i], status: gs[i] ?? null }] : []));
  if (gfzRows.length) {
    const { error } = await sb.from('kp_index').upsert(gfzRows);
    detail.gfz_kp = error ? error.message : gfzRows.length;
  } else detail.gfz_kp = 'no data';

  // 3. Real-time solar wind (last ~2 hours at 1-minute cadence).
  const active = (rs: Row[]) => (rs.some(r => 'active' in r) ? rs.filter(r => r.active === true || r.active === 'true' || r.active === 1) : rs);
  const [mag, plasma] = await Promise.all([
    firstRows([`${SWPC}/products/solar-wind/mag-2-hour.json`, `${SWPC}/products/solar-wind/mag-1-day.json`, `${SWPC}/json/rtsw/rtsw_mag_1m.json`]).then(active),
    firstRows([`${SWPC}/products/solar-wind/plasma-2-hour.json`, `${SWPC}/products/solar-wind/plasma-1-day.json`, `${SWPC}/json/rtsw/rtsw_wind_1m.json`]).then(active),
  ]);
  const cutoff = Date.now() - 3 * 36e5;
  const wind = new Map<string, { time_tag: string; bz_gsm: number | null; bt: number | null; speed: number | null; density: number | null }>();
  for (const r of mag) {
    const t = iso(r.time_tag);
    if (t && Date.parse(t) >= cutoff) wind.set(t, { time_tag: t, bz_gsm: num(r.bz_gsm ?? r.bz), bt: num(r.bt), speed: null, density: null });
  }
  for (const r of plasma) {
    const t = iso(r.time_tag);
    if (!t || Date.parse(t) < cutoff) continue;
    const w = wind.get(t) ?? { time_tag: t, bz_gsm: null, bt: null, speed: null, density: null };
    w.speed = num(r.speed ?? r.proton_speed); w.density = num(r.density ?? r.proton_density);
    wind.set(t, w);
  }
  if (wind.size) {
    const { error } = await sb.from('solar_wind').upsert([...wind.values()]);
    detail.solar_wind = error ? error.message : wind.size;
  } else detail.solar_wind = 'no data';

  // 4. OVATION summary: max probability and 10% equatorward edge (northern hemisphere).
  const ov = await json(`${SWPC}/json/ovation_aurora_latest.json`) as Row | null;
  const coords = Array.isArray(ov?.coordinates) ? ov!.coordinates as number[][] : [];
  if (coords.length) {
    const grid = new Map<string, number>();
    let max = 0;
    for (const [lon, lat, v] of coords) {
      if (lat > 0) { grid.set(`${Math.round(lon)},${Math.round(lat)}`, v); max = Math.max(max, v); }
    }
    const edge: [number, number][] = [];
    for (let lon = 0; lon < 360; lon += 4) {
      for (let lat = 35; lat <= 85; lat++) if ((grid.get(`${lon},${lat}`) ?? 0) >= 10) { edge.push([lon, lat]); break; }
    }
    const hp = await text(`${SWPC}/text/aurora-nowcast-hemi-power.txt`);
    let north: number | null = null;
    for (const line of (hp ?? '').split('\n')) {
      const m = line.trim().match(/^\d{4}-\d\d-\d\d_\d\d:\d\d\s+\S+\s+(\d+)\s+(\d+)/);
      if (m) north = +m[1];
    }
    const forecast = iso(ov?.['Forecast Time']);
    if (forecast) {
      const { error } = await sb.from('ovation_snapshots').upsert({
        forecast_time: forecast, observation_time: iso(ov?.['Observation Time']), hemi_power_north: north, max_probability: Math.round(max), edge,
      });
      detail.ovation = error ? error.message : { forecast, max: Math.round(max), edge: edge.length };
    }
  } else detail.ovation = 'no data';

  const ok = Object.values(detail).every(v => typeof v !== 'string' || v === 'no data') && Object.values(detail).some(v => v !== 'no data');
  await sb.from('ingest_runs').insert({ ok, detail });
  return new Response(JSON.stringify({ ok, detail }), { headers: { 'Content-Type': 'application/json' } });
});
