// Saves the current Sun images to the sun-frames bucket for the time-lapse, one group per call (so each call
// stays well inside the Edge CPU limit):
//   sdo   NASA SDO (AIA and HMI) and SOHO's LASCO C2 and C3, as published (512 px JPEG), keyed by Last-Modified.
//   suvi  NOAA's SUVI on GOES-19 (thematic map, 195 and 284 Å)   } the newest frame in SWPC's frame list, keyed by
//   ccor  NOAA's CCOR-1 and CCOR-2 coronagraphs, and their running } the time in its name, and made a 512 px JPEG
//         difference views                                        } (SWPC's are 1024–1280 px, up to 1.3 MB).
// Scheduled hourly by pg_cron (migrations/20261027000200_sun_views.sql). Frames older than KEEP_DAYS are removed.
// Uses the service role, which the Edge runtime provides as an env var. Callers must send pg_cron's key.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { decode, Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const SDO_CHANNELS = {
  '0193': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg',
  '0171': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg',
  '211193171': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_211193171.jpg',
  '0304': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg',
  HMIIC: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg',
  HMIBC: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIBC.jpg',
  '0131': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0131.jpg',
  '0094': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0094.jpg',
  '0211': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0211.jpg',
  '0335': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0335.jpg',
  '1600': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_1600.jpg',
  '1700': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_1700.jpg',
  // SOHO's LASCO C2 and C3 coronagraphs (CMEs leaving the Sun).
  C2: 'https://soho.nascom.nasa.gov/data/realtime/c2/512/latest.jpg',
  C3: 'https://soho.nascom.nasa.gov/data/realtime/c3/512/latest.jpg',
} as const;

/** SWPC's frame lists (JSON, oldest first: { url, time_tag? }). */
const SWPC = 'https://services.swpc.noaa.gov';
const SWPC_CHANNELS: Record<'suvi' | 'ccor', Record<string, string>> = {
  suvi: {
    SUVIMAP: '/products/animations/suvi-primary-map.json',
    SUVI195: '/products/animations/suvi-primary-195.json',
    SUVI284: '/products/animations/suvi-primary-284.json',
  },
  ccor: {
    CCOR1: '/products/animations/ccor1/ccor1.json',
    CCOR1D: '/products/animations/ccor1-diff/ccor1-diff.json',
    CCOR2: '/products/animations/ccor2/ccor2.json',
    CCOR2D: '/products/animations/ccor2-diff/ccor2-diff.json',
  },
};
/** Saved width of SWPC's frames. */
const WIDTH = 512;
const BUCKET = 'sun-frames';
const KEEP_DAYS = 28;
/** Each image download gives up after this long. */
const TIMEOUT_MS = 15_000;

/** Only pg_cron may run this: it sends the scheduled-jobs key from Vault, checked there by check_alerts_key(). */
async function fromCron(req: Request, db: SupabaseClient): Promise<boolean> {
  const k = req.headers.get('x-cron-key');
  if (!k) return false;
  const { data, error } = await db.rpc('check_alerts_key', { k });
  return !error && data === true;
}

const get = (url: string) => fetch(url, { headers: { 'User-Agent': 'polarlights.io sun time-lapse' }, signal: AbortSignal.timeout(TIMEOUT_MS) });

/** A frame's time from its file name: 20261027_2130_ccor1… or …_s20261027T213200Z_… */
function frameTime(url: string): Date | null {
  const m = url.match(/(\d{4})(\d{2})(\d{2})[T_](\d{2})(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : null;
}

type Save = (channel: string, taken: Date, jpeg: () => Promise<Uint8Array | ArrayBuffer | null>) => Promise<string>;

/** Keeps a frame once per channel and time. */
function saver(db: SupabaseClient): Save {
  return async (channel, taken, jpeg) => {
    const at = taken.toISOString();
    const { data: seen } = await db.from('sun_frames').select('path').eq('channel', channel).eq('taken_at', at).maybeSingle();
    if (seen) return 'unchanged';
    const body = await jpeg();
    if (!body) return 'fetch image failed';
    const path = `${channel}/${at.slice(0, 16).replace(':', '-')}.jpg`;
    const up = await db.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
    if (up.error) return `upload ${up.error.message}`;
    const ins = await db.from('sun_frames').insert({ channel, taken_at: at, path });
    return ins.error ? `insert ${ins.error.message}` : `saved ${path}`;
  };
}

async function captureSdo(save: Save, result: Record<string, string>) {
  for (const [channel, url] of Object.entries(SDO_CHANNELS)) {
    try {
      const res = await get(url);
      if (!res.ok) { result[channel] = `fetch ${res.status}`; continue; }
      const taken = new Date(res.headers.get('last-modified') ?? Date.now());
      taken.setUTCSeconds(0, 0);
      result[channel] = await save(channel, taken, () => res.arrayBuffer());
    } catch (e) {
      result[channel] = `error ${(e as Error).message}`;
    }
  }
}

async function captureSwpc(group: 'suvi' | 'ccor', save: Save, result: Record<string, string>) {
  for (const [channel, list] of Object.entries(SWPC_CHANNELS[group])) {
    try {
      const res = await get(SWPC + list);
      if (!res.ok) { result[channel] = `fetch ${res.status}`; continue; }
      const frames = (await res.json()) as { url: string; time_tag?: string }[];
      const last = frames.at(-1);
      const taken = last && (last.time_tag ? new Date(last.time_tag) : frameTime(last.url));
      if (!last || !taken || isNaN(+taken)) { result[channel] = 'error no frame'; continue; }
      result[channel] = await save(channel, taken, async () => {
        const img = await get(SWPC + last.url);
        if (!img.ok) return null;
        const pic = await decode(new Uint8Array(await img.arrayBuffer()));
        if (!(pic instanceof Image)) return null;
        if (pic.width > WIDTH) pic.resize(WIDTH, Image.RESIZE_AUTO);
        return pic.encodeJPEG(82);
      });
    } catch (e) {
      result[channel] = `error ${(e as Error).message}`;
    }
  }
}

const refuse = () => new Response(JSON.stringify({ error: 'unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  if (!(await fromCron(req, db))) { console.warn('capture-sun: refused a call without the cron key'); return refuse(); }
  const result: Record<string, string> = {};
  // The group to capture, from the request body (pg_cron sends one call per group); SDO by default.
  const { group = 'sdo' } = (await req.json().catch(() => ({}))) as { group?: string };
  const save = saver(db);
  if (group === 'suvi' || group === 'ccor') await captureSwpc(group, save, result);
  else await captureSdo(save, result);

  // Keep one solar rotation and a day.
  const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString();
  const { data: old } = await db.from('sun_frames').select('channel, taken_at, path').lt('taken_at', cutoff).limit(500);
  if (old?.length) {
    await db.storage.from(BUCKET).remove(old.map(o => o.path));
    await db.from('sun_frames').delete().in('path', old.map(o => o.path));
    result.pruned = String(old.length);
  }
  const failed = Object.entries(result).filter(([, v]) => /^(fetch|upload|insert|error) /.test(v));
  if (failed.length) console.warn('capture-sun: some frames failed', JSON.stringify(Object.fromEntries(failed)));
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
});
