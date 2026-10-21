import { createClient } from '@supabase/supabase-js';
import { dailyMax, gfzKp, kpNow, noaaKp, outlook27, type KpDay, type OutlookDay } from './feeds';

export type KpSource = 'gfz' | 'noaa';

export interface AccountData {
  /** Daily maximum Kp for the last 90 UTC days (GFZ Potsdam; NOAA's last 30 days when GFZ is down). */
  days: KpDay[];
  /** Where `days` came from, for the source labels. */
  sources: KpSource[];
  /** NOAA 27-day outlook, today onward. */
  outlook: OutlookDay[];
  kp: { t: number; kp: number } | null;
  fetchedAt: number;
}

type Kp = { t: number; kp: number; src: KpSource };

/**
 * Measured Kp the ingest job has saved (kp_index; GFZ and NOAA rows, not NOAA's forecasts). The table
 * is readable only with the service key, so this returns [] where that isn't configured.
 */
async function storedKp(days: number): Promise<Kp[]> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await db.from('kp_index').select('time_tag, source, kp, status')
      .gte('time_tag', new Date(Date.now() - days * 864e5).toISOString())
      .in('status', ['observed', 'estimated', 'pre', 'def', 'now']).limit(2000);
    return (data ?? []).map(r => ({ t: Date.parse(r.time_tag), kp: Number(r.kp), src: (r.source === 'gfz' ? 'gfz' : 'noaa') as KpSource }))
      .filter(x => Number.isFinite(x.t) && Number.isFinite(x.kp) && x.kp >= 0);
  } catch {
    return [];
  }
}

/**
 * GFZ Potsdam's Kp history; when GFZ can't be reached, NOAA's last 30 days with the saved Kp laid
 * over it (saved GFZ values win over NOAA's for the same 3 hours).
 */
async function kpHistory(days: number): Promise<{ xs: { t: number; kp: number }[]; sources: KpSource[] }> {
  const gfz = await gfzKp(days);
  if (gfz.length) return { xs: gfz, sources: ['gfz'] };
  const [noaa, stored] = await Promise.all([noaaKp(), storedKp(days)]);
  const rank = (s: KpSource) => (s === 'gfz' ? 1 : 0);
  const slot = new Map<number, Kp>();
  for (const x of [...noaa.map(x => ({ ...x, src: 'noaa' as KpSource })), ...stored]) {
    const k = Math.floor(x.t / 108e5);
    const had = slot.get(k);
    if (!had || rank(x.src) >= rank(had.src)) slot.set(k, x);
  }
  const xs = [...slot.values()];
  const sources = (['gfz', 'noaa'] as KpSource[]).filter(s => xs.some(x => x.src === s));
  return { xs, sources };
}

export async function loadAccount(): Promise<AccountData> {
  const [hist, outlook, kp] = await Promise.all([kpHistory(90), outlook27(), kpNow()]);
  const today = Math.floor(Date.now() / 864e5) * 864e5;
  return { days: dailyMax(hist.xs).slice(-90), sources: hist.sources, outlook: outlook.filter(d => d.t >= today), kp, fetchedAt: Date.now() };
}
