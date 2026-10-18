'use client';

import { useEffect, useMemo, useState } from 'react';
import { moon } from './astro';
import type { KpPoint } from './feeds';
import { hourlyScores, verdict } from './tonight';
import { useConditions } from './useConditions';

/**
 * The next 12 hours and the verdict for one point (lib/tonight), from its live conditions.
 * Used by the verdict card on the Now page and by the map panel for any point tapped on the map.
 */
export function usePointVerdict(place: { lat: number; lon: number } | null, kp: number | null, series: KpPoint[]) {
  const { data: cond, loading } = useConditions(place?.lat, place?.lon);
  // Client clock only (pages are prerendered); refreshed every five minutes.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 3e5); return () => clearInterval(id); }, []);
  const result = useMemo(() => {
    if (!place || !cond || now === null) return null;
    const m = moon(now, place.lat, place.lon);
    const hours = hourlyScores({
      lat: place.lat, lon: place.lon, need: cond.kpNeeded, kpNow: kp, series,
      ovationNearby: cond.aurora?.nearby ?? null, cloudNow: cond.cloud?.aurora ?? null, cloudHourly: cond.cloud?.next12h ?? [],
      moonIllumination: m.illumination, now,
    });
    return { hours, v: verdict(hours, cond.kpNeeded), m };
  }, [place?.lat, place?.lon, cond, now, kp, series]); // eslint-disable-line react-hooks/exhaustive-deps -- the point, not its object
  return { cond, loading, now, result };
}
