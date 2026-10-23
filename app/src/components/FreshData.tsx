'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** Server data older than this is fetched again. */
const MAX_AGE = 10 * 6e4;
/** At most one refresh this often (a cached page can come back still old once while it rebuilds). */
const GAP = 6e4;

/**
 * Pages are served from a cache rebuilt in the background, so the first visit after a quiet spell can show
 * Kp and forecasts from hours ago. `at` is when the server built this data; when it is older than ten
 * minutes (on opening, on returning to the app, or while it stays open) the page fetches it again.
 */
export function FreshData({ at }: { at: number }) {
  const router = useRouter();
  const last = useRef(0);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      const now = Date.now();
      if (now - at > MAX_AGE && now - last.current > GAP) { last.current = now; router.refresh(); }
    };
    check();
    document.addEventListener('visibilitychange', check);
    const id = setInterval(check, GAP);
    return () => { document.removeEventListener('visibilitychange', check); clearInterval(id); };
  }, [at, router]);
  return null;
}
