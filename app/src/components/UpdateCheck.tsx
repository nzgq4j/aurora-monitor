'use client';

import { useEffect } from 'react';

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
/** Only after this long in the background, so switching apps briefly never reloads the page. */
const AWAY = 60_000;

/**
 * Reloads onto a new release when the page comes back to the foreground. The Android app and installed
 * web app stay open for days, so without this they keep running the code they started with.
 */
export function UpdateCheck() {
  useEffect(() => {
    if (BUILD === 'dev') return;
    let hiddenAt = 0;
    const onVisibility = async () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (!hiddenAt || Date.now() - hiddenAt < AWAY) return;
      hiddenAt = 0;
      try {
        const { build } = await (await fetch('/api/version', { cache: 'no-store' })).json();
        if (build && build !== 'dev' && build !== BUILD) window.location.reload();
      } catch { /* offline: keep the page */ }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  return null;
}
