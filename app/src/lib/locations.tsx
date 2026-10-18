'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { useI18n } from '../i18n/I18n';
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

/** A point to show conditions for. */
export interface Place { name: string; lat: number; lon: number }

export interface PlaceResult { name: string; detail: string; lat: number; lon: number }

type NewLocation = Pick<SavedLocation, 'name' | 'lat' | 'lon' | 'source'>;

interface Ctx {
  locations: SavedLocation[];
  /** Where saved locations live: the user's account (signed in), or this browser. */
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
  /**
   * Save a place and make it Home. Reuses a matching saved location; at the plan's
   * location limit it replaces the current Home instead of adding a new one.
   */
  saveAsHome: (place: NewLocation, limit: number) => Promise<SavedLocation | null>;
  /** An unsaved place picked on the Now page for this visit (overrides Home there). */
  viewPlace: Place | null;
  setViewPlace: (p: Place | null) => void;
  /** What the Now page shows: the unsaved view if any, else Home. */
  shownPlace: (Place & { isHome: boolean }) | null;
}

const LocationsCtx = createContext<Ctx | null>(null);
const LS_KEY = 'oval.locations.v1';
const VIEW_KEY = 'oval.view.v1';

const readLocal = (): SavedLocation[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
};
const writeLocal = (xs: SavedLocation[]) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(xs)); } catch { /* storage unavailable */ }
};

interface Row { id: string; name: string; lat: number; lon: number; source: LocationSource; is_home: boolean; created_at: string }
const fromRow = (r: Row): SavedLocation => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, source: r.source, isHome: r.is_home, createdAt: r.created_at });

/** Language of the page, so place names come back in it. */
const pageLang = () => (typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en');

/** Place search (Open-Meteo geocoding, no key required). */
export async function searchPlaces(q: string): Promise<PlaceResult[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=${pageLang()}&format=json`);
  if (!res.ok) throw new Error('Search failed');
  const j = await res.json();
  return (j.results ?? []).map((r: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }) => ({
    name: r.name, detail: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude,
  }));
}

/** Name for a coordinate (BigDataCloud client-side reverse geocoding, no key required). */
export async function placeName(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${pageLang()}`);
    const j = await res.json();
    const city = j.city || j.locality;
    const region = j.principalSubdivisionCode?.split('-').pop() || j.principalSubdivision || j.countryCode;
    if (city) return region ? `${city}, ${region}` : city;
  } catch { /* fall through */ }
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

/** The device's current position and a place name, without saving anything. */
export async function devicePlace(): Promise<{ name: string; lat: number; lon: number }> {
  const pos = await position();
  const lat = Math.round(pos.coords.latitude * 1000) / 1000, lon = Math.round(pos.coords.longitude * 1000) / 1000;
  return { name: await placeName(lat, lon), lat, lon };
}

/** `maxAge` 0 forces a fresh fix (explicit button presses); silent refreshes may reuse a recent one. */
function position(maxAge = 0): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('loc.err.noDevice'));
    navigator.geolocation.getCurrentPosition(resolve, e => reject(new Error(e.code === e.PERMISSION_DENIED ? 'loc.err.denied' : 'loc.err.position')), { enableHighAccuracy: false, timeout: 15000, maximumAge: maxAge });
  });
}

export function LocationsProvider({ children }: { children: ReactNode }) {
  const sb = supabase();
  const { user, ready } = useAuth();
  const { t, tx, tn } = useI18n();
  // Signed in: the user's rows in Supabase. Signed out (or not connected): this browser.
  const remote = !!(sb && user);
  const backend: Ctx['backend'] = remote ? 'supabase' : 'local';
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [status, setStatus] = useState<Ctx['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [viewPlace, setView] = useState<Place | null>(null);
  useEffect(() => { try { setView(JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null')); } catch { /* storage unavailable */ } }, []);
  const setViewPlace = useCallback((p: Place | null) => {
    setView(p);
    try { if (p) sessionStorage.setItem(VIEW_KEY, JSON.stringify(p)); else sessionStorage.removeItem(VIEW_KEY); } catch { /* storage unavailable */ }
  }, []);
  const wanted = useRef(false);
  const loadedFor = useRef<string | null>(null);
  const list = useRef<SavedLocation[]>([]);
  const put = (xs: SavedLocation[]) => { list.current = xs; setLocations(xs); if (!remote) writeLocal(xs); };

  const fetchAll = useCallback(async () => {
    const key = remote ? user!.id : 'local';
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    setStatus('loading'); setError(null);
    if (!remote) { list.current = readLocal(); setLocations(list.current); setStatus('ready'); return; }
    // First load after signing in: move anything saved in this browser into the account.
    const local = readLocal();
    if (local.length) {
      const { data: existing } = await sb!.from('locations').select('source, is_home');
      const hasHome = (existing ?? []).some(r => r.is_home);
      const hasDevice = (existing ?? []).some(r => r.source === 'device');
      const rows = local.filter(l => !(l.source === 'device' && hasDevice))
        .map(l => ({ name: l.name, lat: l.lat, lon: l.lon, source: l.source, is_home: l.isHome && !hasHome }));
      // One at a time, so a plan limit only skips the extras.
      let skipped = 0;
      for (const row of rows) {
        const { error: e } = await sb!.from('locations').insert(row);
        if (e) skipped++;
      }
      writeLocal([]);
      if (skipped) setError(tn('loc.err.skipped', skipped));
    }
    const { data, error: e } = await sb!.from('locations').select('*').order('created_at');
    if (e) { setError(t('loc.err.load')); setStatus('error'); return; }
    list.current = (data as Row[]).map(fromRow); setLocations(list.current); setStatus('ready');
  }, [remote, sb, user]);

  // Reload when the signed-in user changes (sign in, sign out, switch account).
  useEffect(() => { if (wanted.current && ready) fetchAll(); }, [ready, fetchAll]);

  /** Read the account's locations again, e.g. after another device changed them. */
  const refetch = useCallback(async () => {
    if (!remote) return;
    const { data, error: e } = await sb!.from('locations').select('*').order('created_at');
    if (e || !data) return;
    list.current = (data as Row[]).map(fromRow); setLocations(list.current);
  }, [remote, sb]);

  // An installed app or a tab can stay open for hours; catch up when it comes back to the front.
  useEffect(() => {
    if (!remote) return;
    let last = Date.now();
    const back = () => {
      if (document.visibilityState !== 'visible' || !wanted.current || Date.now() - last < 30e3) return;
      last = Date.now();
      void refetch();
    };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [remote, refetch]);

  const load = useCallback(async () => {
    wanted.current = true;
    if (ready) await fetchAll();
  }, [ready, fetchAll]);

  const add = useCallback<Ctx['add']>(async loc => {
    const isHome = !list.current.some(l => l.isHome);
    if (remote) {
      const insert = (is_home: boolean) => sb!.from('locations').insert({ name: loc.name, lat: loc.lat, lon: loc.lon, source: loc.source, is_home }).select().single();
      let { data, error: e } = await insert(isHome);
      // 23505: the account already has a Home (or a device location) this copy of the list didn't know about.
      // Save it as an ordinary location instead, then catch up with the account's list.
      const stale = e?.code === '23505';
      if (stale && isHome) ({ data, error: e } = await insert(false));
      if (e) {
        if (stale) await refetch();
        setError(/limit reached/i.test(e.message) ? t('loc.err.limit') : t('loc.err.save'));
        return null;
      }
      const saved = fromRow(data as Row);
      if (stale) { await refetch(); return list.current.find(l => l.id === saved.id) ?? saved; }
      put([...list.current, saved]);
      return saved;
    }
    const saved: SavedLocation = { ...loc, id: crypto.randomUUID(), isHome, createdAt: new Date().toISOString() };
    put([...list.current, saved]);
    return saved;
  }, [remote, sb, refetch]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback<Ctx['remove']>(async id => {
    const gone = list.current.find(l => l.id === id);
    let rest = list.current.filter(l => l.id !== id);
    if (gone?.isHome && rest.length) rest = rest.map((l, i) => (i === 0 ? { ...l, isHome: true } : l));
    if (remote) {
      const { error: e } = await sb!.from('locations').delete().eq('id', id);
      if (e) { setError(t('loc.err.remove')); return; }
      if (gone?.isHome && rest.length) await sb!.from('locations').update({ is_home: true }).eq('id', rest[0].id);
    }
    put(rest);
  }, [remote, sb]); // eslint-disable-line react-hooks/exhaustive-deps

  const setHome = useCallback<Ctx['setHome']>(async id => {
    if (remote) {
      const { error: e } = await sb!.rpc('set_home_location', { location_id: id });
      if (e) { setError(t('loc.err.home')); return; }
    }
    put(list.current.map(l => ({ ...l, isHome: l.id === id })));
  }, [remote, sb]); // eslint-disable-line react-hooks/exhaustive-deps

  const detectDevice = useCallback<Ctx['detectDevice']>(async opts => {
    setDetecting(true);
    try {
      const pos = await position(opts?.silent ? 60e3 : 0);
      const lat = Math.round(pos.coords.latitude * 1000) / 1000, lon = Math.round(pos.coords.longitude * 1000) / 1000;
      const existing = list.current.find(l => l.source === 'device');
      if (existing && Math.abs(existing.lat - lat) < 0.01 && Math.abs(existing.lon - lon) < 0.01) return existing;
      const name = await placeName(lat, lon);
      if (existing) {
        if (remote) await sb!.from('locations').update({ name, lat, lon, updated_at: new Date().toISOString() }).eq('id', existing.id);
        const updated = { ...existing, name, lat, lon };
        put(list.current.map(l => (l.id === existing.id ? updated : l)));
        return updated;
      }
      return await add({ name, lat, lon, source: 'device' });
    } catch (e) {
      if (!opts?.silent) setError(tx((e as Error).message));
      return null;
    } finally {
      setDetecting(false);
    }
  }, [remote, sb, add]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAsHome = useCallback<Ctx['saveAsHome']>(async (place, limit) => {
    setError(null);
    const near = (l: SavedLocation) => Math.abs(l.lat - place.lat) < 0.01 && Math.abs(l.lon - place.lon) < 0.01;
    const match = list.current.find(near);
    if (match) { if (!match.isHome) await setHome(match.id); return list.current.find(l => l.id === match.id) ?? match; }
    const device = list.current.find(l => l.source === 'device');
    const replace = async (target: SavedLocation, source: LocationSource) => {
      const patch = { name: place.name, lat: place.lat, lon: place.lon, source };
      if (remote) {
        const { error: e } = await sb!.from('locations').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', target.id);
        if (e) { setError(t('loc.err.save')); return null; }
      }
      const updated = { ...target, ...patch };
      put(list.current.map(l => (l.id === target.id ? updated : l)));
      if (!updated.isHome) await setHome(updated.id);
      return list.current.find(l => l.id === updated.id) ?? updated;
    };
    // A fresh device position replaces the single device location.
    if (place.source === 'device' && device) return replace(device, 'device');
    if (list.current.length < limit) {
      const saved = await add(place);
      if (saved && !saved.isHome) await setHome(saved.id);
      return saved ? list.current.find(l => l.id === saved.id) ?? saved : null;
    }
    // At the limit: overwrite the current Home (or the first location).
    const target = list.current.find(l => l.isHome) ?? list.current[0];
    if (!target) return null;
    const source: LocationSource = place.source === 'device' && (!device || device.id === target.id) ? 'device' : 'manual';
    return replace(target, source);
  }, [remote, sb, add, setHome]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<Ctx>(() => {
    const home = locations.find(l => l.isHome) ?? null;
    const shownPlace = viewPlace ? { ...viewPlace, isHome: false } : home ? { name: home.name, lat: home.lat, lon: home.lon, isHome: true } : null;
    return { locations, backend, status, error, detecting, load, add, remove, setHome, detectDevice, saveAsHome, viewPlace, setViewPlace, shownPlace };
  }, [locations, backend, status, error, detecting, load, add, remove, setHome, detectDevice, saveAsHome, viewPlace, setViewPlace]);
  return <LocationsCtx.Provider value={value}>{children}</LocationsCtx.Provider>;
}

export function useLocations(): Ctx {
  const v = useContext(LocationsCtx);
  if (!v) throw new Error('useLocations must be used inside LocationsProvider');
  return v;
}
