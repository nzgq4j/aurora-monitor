'use client';

import { useEffect, useState } from 'react';
import type { Conditions } from '../app/api/conditions/route';

const cache = new Map<string, { at: number; p: Promise<Conditions | null> }>();
const TTL = 5 * 60e3;

function get(lat: number, lon: number) {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = fetch(`/api/conditions?lat=${lat}&lon=${lon}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  cache.set(k, { at: Date.now(), p });
  return p;
}

/** Live viewing conditions (aurora probability, cloud, darkness) for a point. */
export function useConditions(lat: number | undefined, lon: number | undefined) {
  const [data, setData] = useState<Conditions | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    let live = true;
    // A new point: drop the last one's conditions rather than show them under the new name.
    setData(null);
    setLoading(true);
    get(lat, lon).then(d => { if (live) { setData(d); setLoading(false); } });
    return () => { live = false; };
  }, [lat, lon]);
  return { data, loading };
}
