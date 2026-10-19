// Saves the current SDO images (AIA 193, AIA 171, HMI) to the sun-frames bucket for the time-lapse.
// Scheduled hourly by pg_cron (see migrations/20261019000100_sun_frames.sql). Each image is kept once,
// keyed by SDO's Last-Modified time; frames older than KEEP_DAYS are removed.
// Uses the service role, which the Edge runtime provides as an env var.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const CHANNELS = {
  '0193': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg',
  '0171': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg',
  HMIIC: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg',
} as const;
const BUCKET = 'sun-frames';
const KEEP_DAYS = 28;

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const result: Record<string, string> = {};

  for (const [channel, url] of Object.entries(CHANNELS)) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'polarlights.io sun time-lapse' } });
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
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
});
