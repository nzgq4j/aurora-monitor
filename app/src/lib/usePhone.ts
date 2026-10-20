'use client';

import { useSyncExternalStore } from 'react';

/** The phone layout's width (the tab bar replaces the header below it; see globals.css). */
export const PHONE_QUERY = '(max-width: 640px)';

const subscribe = (cb: () => void) => {
  const m = window.matchMedia(PHONE_QUERY);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

/** True at phone widths. The server (and the first render in the browser) assumes a wider screen. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}
