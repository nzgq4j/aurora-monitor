'use client';

import { useEffect, useState } from 'react';
import type { Conditions } from '../app/api/conditions/route';

/**
 * A conditions response: `offline` when the network failed, or the service worker answered with the copy
 * it saved (header x-pl-offline); `at` is when that copy was made.
 */
interface Fetched { data: Conditions | null; offline: boolean; at: number | null }

const cache = new Map<string, { at: number; p: Promise<Fetched> }>();
const TTL = 5 * 60e3;
const key = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

function get(lat: number, lon: number) {
  const k = key(lat, lon);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p: Promise<Fetched> = fetch(`/api/conditions?lat=${lat}&lon=${lon}`)
    .then(async r => {
      const offline = r.headers.get('x-pl-offline') === '1';
      const date = Date.parse(r.headers.get('date') ?? '');
      return { data: r.ok ? await r.json() as Conditions : null, offline, at: offline && Number.isFinite(date) ? date : null };
    })
    .catch(() => ({ data: null, offline: true, at: null }));
  // An offline answer isn't kept: the next look tries the network again.
  p.then(f => { if (f.offline && cache.get(k)?.p === p) cache.delete(k); });
  cache.set(k, { at: Date.now(), p });
  return p;
}

/** Live viewing conditions (aurora probability, cloud, darkness) for a point; fetched again on reconnecting. */
export function useConditions(lat: number | undefined, lon: number | undefined) {
  const [state, setState] = useState<Fetched & { loading: boolean }>({ data: null, offline: false, at: null, loading: false });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    const again = () => setTries(n => n + 1);
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, []);
  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    let live = true;
    // A new point: drop the last one's conditions rather than show them under the new name.
    setState(s => ({ ...s, data: null, loading: true }));
    get(lat, lon).then(f => { if (live) setState({ ...f, loading: false }); });
    return () => { live = false; };
  }, [lat, lon, tries]);
  return state;
}
