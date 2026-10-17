'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export type LocationSource = 'manual' | 'device';

export interface SavedLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  source: LocationSource;
  isHome: boolean;
  createdAt: string;
}

export interface PlaceResult { name: string; detail: string; lat: number; lon: number }

type NewLocation = Pick<SavedLocation, 'name' | 'lat' | 'lon' | 'source'>;

interface Ctx {
  locations: SavedLocation[];
  /** Where saved locations live: the Supabase database, or this browser until it is connected. */
  backend: 'supabase' | 'local';
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  detecting: boolean;
  load: () => Promise<void>;
  add: (loc: NewLocation) => Promise<SavedLocation | null>;
  remove: (id: string) => Promise<void>;
  setHome: (id: string) => Promise<void>;
  /** Ask the device for its position, name it, and save/refresh the single "device" location. */
  detectDevice: (opts?: { silent?: boolean }) => Promise<SavedLocation | null>;
}

const LocationsCtx = createContext<Ctx | null>(null);
const LS_KEY = 'oval.locations.v1';

const readLocal = (): SavedLocation[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
};
const writeLocal = (xs: SavedLocation[]) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(xs)); } catch { /* storage unavailable */ }
};

interface Row { id: string; name: string; lat: number; lon: number; source: LocationSource; is_home: boolean; created_at: string }
const fromRow = (r: Row): SavedLocation => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, source: r.source, isHome: r.is_home, createdAt: r.created_at });

/** Place search (Open-Meteo geocoding, no key required). */
export async function searchPlaces(q: string): Promise<PlaceResult[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=en&format=json`);
  if (!res.ok) throw new Error('Search failed');
  const j = await res.json();
  return (j.results ?? []).map((r: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }) => ({
    name: r.name, detail: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude,
  }));
}

/** Name for a coordinate (BigDataCloud client-side reverse geocoding, no key required). */
async function placeName(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    const j = await res.json();
    const city = j.city || j.locality;
    const region = j.principalSubdivisionCode?.split('-').pop() || j.principalSubdivision || j.countryCode;
    if (city) return region ? `${city}, ${region}` : city;
  } catch { /* fall through */ }
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This device does not provide location.'));
    navigator.geolocation.getCurrentPosition(resolve, e => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location permission was denied.' : 'Could not get your location.')), { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60e3 });
  });
}

export function LocationsProvider({ children }: { children: ReactNode }) {
  const sb = supabase();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [status, setStatus] = useState<Ctx['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [backend, setBackend] = useState<Ctx['backend']>(sb ? 'supabase' : 'local');
  const loaded = useRef(false);
  const list = useRef<SavedLocation[]>([]);

  /** Supabase needs a user; visitors get an anonymous one the first time they save something. */
  const ensureUser = useCallback(async () => {
    if (!sb) return false;
    const { data } = await sb.auth.getSession();
    if (data.session) return true;
    const { error: e } = await sb.auth.signInAnonymously();
    if (e) { setBackend('local'); setError('Saving to this browser: account storage is not enabled yet.'); return false; }
    return true;
  }, [sb]);

  const load = useCallback(async () => {
    if (loaded.current) return;
    loaded.current = true;
    setStatus('loading');
    if (sb) {
      const { data: s } = await sb.auth.getSession();
      if (s.session) {
        const { data, error: e } = await sb.from('locations').select('*').order('created_at');
        if (!e) { list.current = (data as Row[]).map(fromRow); setLocations(list.current); setStatus('ready'); return; }
        setError('Could not load saved locations.');
      }
      // No session yet: show anything saved locally until the first save creates one.
    }
    list.current = readLocal(); setLocations(list.current); setStatus('ready');
  }, [sb]);

  const add = useCallback<Ctx['add']>(async loc => {
    const isHome = !list.current.some(l => l.isHome);
    if (sb && backend === 'supabase' && await ensureUser()) {
      const { data, error: e } = await sb.from('locations').insert({ name: loc.name, lat: loc.lat, lon: loc.lon, source: loc.source, is_home: isHome }).select().single();
      if (e) { setError('Could not save that location.'); return null; }
      const saved = fromRow(data as Row);
      list.current = [...list.current, saved]; setLocations(list.current);
      return saved;
    }
    const saved: SavedLocation = { ...loc, id: crypto.randomUUID(), isHome, createdAt: new Date().toISOString() };
    list.current = [...list.current, saved]; setLocations(list.current); writeLocal(list.current);
    return saved;
  }, [sb, backend, ensureUser]);

  const remove = useCallback<Ctx['remove']>(async id => {
    const gone = list.current.find(l => l.id === id);
    let rest = list.current.filter(l => l.id !== id);
    if (gone?.isHome && rest.length) rest = rest.map((l, i) => (i === 0 ? { ...l, isHome: true } : l));
    if (sb && backend === 'supabase') {
      await sb.from('locations').delete().eq('id', id);
      if (gone?.isHome && rest.length) await sb.from('locations').update({ is_home: true }).eq('id', rest[0].id);
    }
    list.current = rest; setLocations(rest); if (!(sb && backend === 'supabase')) writeLocal(rest);
  }, [sb, backend]);

  const setHome = useCallback<Ctx['setHome']>(async id => {
    if (sb && backend === 'supabase') {
      const { error: e } = await sb.rpc('set_home_location', { location_id: id });
      if (e) { setError('Could not change your home location.'); return; }
    }
    const next = list.current.map(l => ({ ...l, isHome: l.id === id }));
    list.current = next; setLocations(next); if (!(sb && backend === 'supabase')) writeLocal(next);
  }, [sb, backend]);

  const detectDevice = useCallback<Ctx['detectDevice']>(async opts => {
    setDetecting(true);
    try {
      const pos = await position();
      const lat = Math.round(pos.coords.latitude * 1000) / 1000, lon = Math.round(pos.coords.longitude * 1000) / 1000;
      const name = await placeName(lat, lon);
      const existing = list.current.find(l => l.source === 'device');
      if (existing) {
        if (Math.abs(existing.lat - lat) < 0.01 && Math.abs(existing.lon - lon) < 0.01) return existing;
        if (sb && backend === 'supabase') await sb.from('locations').update({ name, lat, lon }).eq('id', existing.id);
        const updated = { ...existing, name, lat, lon };
        const next = list.current.map(l => (l.id === existing.id ? updated : l));
        list.current = next; setLocations(next); if (!(sb && backend === 'supabase')) writeLocal(next);
        return updated;
      }
      return await add({ name, lat, lon, source: 'device' });
    } catch (e) {
      if (!opts?.silent) setError((e as Error).message);
      return null;
    } finally {
      setDetecting(false);
    }
  }, [sb, backend, add]);

  const value = useMemo<Ctx>(() => ({ locations, backend, status, error, detecting, load, add, remove, setHome, detectDevice }),
    [locations, backend, status, error, detecting, load, add, remove, setHome, detectDevice]);
  return <LocationsCtx.Provider value={value}>{children}</LocationsCtx.Provider>;
}

export function useLocations(): Ctx {
  const v = useContext(LocationsCtx);
  if (!v) throw new Error('useLocations must be used inside LocationsProvider');
  return v;
}
