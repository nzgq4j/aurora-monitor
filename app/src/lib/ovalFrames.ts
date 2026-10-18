import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Past OVATION grids for the map's time slider (#43), saved every 10 minutes by the ingest job
 * (ovation_snapshots.grid, readable by anyone under RLS) and kept for about a day.
 */
let client: SupabaseClient | null = null;
function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

export interface Frame { forecast: number; observed: number | null }

/** One frame per half hour over the last 24 hours (the latest in each half hour), oldest first. */
export async function listFrames(): Promise<Frame[]> {
  const sb = db();
  if (!sb) return [];
  const since = new Date(Date.now() - 24 * 36e5).toISOString();
  const { data, error } = await sb.from('ovation_snapshots').select('forecast_time, observation_time')
    .gte('forecast_time', since).not('grid', 'is', null).order('forecast_time');
  if (error || !data) return [];
  const byHalfHour = new Map<number, Frame>();
  for (const r of data as { forecast_time: string; observation_time: string | null }[]) {
    const f = Date.parse(r.forecast_time);
    byHalfHour.set(Math.floor(f / 18e5), { forecast: f, observed: r.observation_time ? Date.parse(r.observation_time) : null });
  }
  return [...byHalfHour.values()];
}

/** The grid saved for a forecast time (ms), in /api/oval's layout, or null. */
export async function getFrame(forecast: number): Promise<{ observed: number | null; forecast: number; data: string } | null> {
  const sb = db();
  if (!sb || !Number.isFinite(forecast)) return null;
  const { data } = await sb.from('ovation_snapshots').select('forecast_time, observation_time, grid')
    .eq('forecast_time', new Date(forecast).toISOString()).not('grid', 'is', null).maybeSingle();
  if (!data) return null;
  const r = data as { forecast_time: string; observation_time: string | null; grid: string };
  return { forecast: Date.parse(r.forecast_time), observed: r.observation_time ? Date.parse(r.observation_time) : null, data: r.grid };
}
