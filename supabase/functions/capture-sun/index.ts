// Saves the current SDO images (AIA 193, 171, 131, 94 and 304, the 211·193·171 composite, HMI and the HMI
// magnetogram) and SOHO's LASCO C2 coronagraph to the sun-frames bucket for the time-lapse.
// Scheduled hourly by pg_cron (see migrations/20261019000100_sun_frames.sql). Each image is kept once,
// keyed by SDO's Last-Modified time; frames older than KEEP_DAYS are removed.
// Uses the service role, which the Edge runtime provides as an env var. Callers must send pg_cron's key.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';

const CHANNELS = {
  '0193': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg',
  '0171': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg',
  '211193171': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_211193171.jpg',
  '0304': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg',
  HMIIC: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg',
  HMIBC: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIBC.jpg',
  '0131': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0131.jpg',
  '0094': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0094.jpg',
  // SOHO's LASCO C2 coronagraph (CMEs leaving the Sun).
  C2: 'https://soho.nascom.nasa.gov/data/realtime/c2/512/latest.jpg',
} as const;
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
const refuse = () => new Response(JSON.stringify({ error: 'unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  if (!(await fromCron(req, db))) { console.warn('capture-sun: refused a call without the cron key'); return refuse(); }
  const result: Record<string, string> = {};

  for (const [channel, url] of Object.entries(CHANNELS)) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'polarlights.io sun time-lapse' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) { result[channel] = `fetch ${res.status}`; continue; }
      const taken = new Date(res.headers.get('last-modified') ?? Date.now());
      taken.setUTCSeconds(0, 0);
      const { data: seen } = await db.from('sun_frames').select('path').eq('channel', channel).eq('taken_at', taken.toISOString()).maybeSingle();
      if (seen) { result[channel] = 'unchanged'; continue; }
      const path = `${channel}/${taken.toISOString().slice(0, 16).replace(':', '-')}.jpg`;
      const up = await db.storage.from(BUCKET).upload(path, await res.arrayBuffer(), { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
      if (up.error) { result[channel] = `upload ${up.error.message}`; continue; }
      const ins = await db.from('sun_frames').insert({ channel, taken_at: taken.toISOString(), path });
      result[channel] = ins.error ? `insert ${ins.error.message}` : `saved ${path}`;
    } catch (e) {
      result[channel] = `error ${(e as Error).message}`;
    }
  }

  // Keep one solar rotation and a day.
  const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString();
  const { data: old } = await db.from('sun_frames').select('channel, taken_at, path').lt('taken_at', cutoff).limit(500);
  if (old?.length) {
    await db.storage.from(BUCKET).remove(old.map(o => o.path));
    await db.from('sun_frames').delete().lt('taken_at', cutoff);
    result.pruned = String(old.length);
  }
  const failed = Object.entries(result).filter(([, v]) => /^(fetch|upload|insert|error) /.test(v));
  if (failed.length) console.warn('capture-sun: some frames failed', JSON.stringify(Object.fromEntries(failed)));
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
});
