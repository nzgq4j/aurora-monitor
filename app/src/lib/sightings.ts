'use client';

import { supabase } from './supabase';

/**
 * "I saw it" sightings (#67), stored in the sightings table: the database rounds the position to
 * about 10 km and allows one report per user every 12 hours; nobody can read who reported what.
 */
export type Brightness = 'faint' | 'visible' | 'bright';
export interface Sighting { id: number; created_at: string; lat: number; lon: number; brightness: Brightness | null }

export type ReportResult = { ok: true; id: number } | { ok: false; reason: 'signin' | 'limit' | 'error' };

export async function reportSighting(lat: number, lon: number, score: number | null): Promise<ReportResult> {
  const sb = supabase();
  if (!sb) return { ok: false, reason: 'signin' };
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { ok: false, reason: 'signin' };
  const { data, error } = await sb.from('sightings').insert({ lat, lon, score: score === null ? null : Math.round(score) }).select('id').single();
  if (error) return { ok: false, reason: /One sighting per/.test(error.message) ? 'limit' : 'error' };
  return { ok: true, id: (data as { id: number }).id };
}

export async function setBrightness(id: number, brightness: Brightness): Promise<boolean> {
  const { error } = await supabase()?.from('sightings').update({ brightness }).eq('id', id) ?? { error: true };
  return !error;
}

/** Other people's reports within 100 km in the last hour. */
export async function nearbyCount(lat: number, lon: number): Promise<number | null> {
  const { data, error } = await supabase()?.rpc('sightings_nearby', { p_lat: lat, p_lon: lon }) ?? { data: null, error: true };
  return error || typeof data !== 'number' ? null : data;
}

/** Reports from the last `hours` hours, for the map layer. */
export async function recentSightings(hours = 3): Promise<Sighting[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data } = await sb.from('sightings').select('id, created_at, lat, lon, brightness')
    .gte('created_at', new Date(Date.now() - hours * 36e5).toISOString()).order('created_at', { ascending: false }).limit(500);
  return (data as Sighting[] | null) ?? [];
}
