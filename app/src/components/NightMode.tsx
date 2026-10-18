'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { sunAltitude } from '../lib/astro';
import { useLocations } from '../lib/locations';

/**
 * Red night mode (#66): the whole page drawn in dim red on black (html.red-mode, see globals.css), so
 * the app can be used outdoors without spoiling dark-adapted eyes. Off, on, or automatic while it's
 * dark at the user's location (Sun below −6°). Remembered on this device.
 */
export type NightSetting = 'off' | 'on' | 'auto';
export const NIGHT_KEY = 'pl.night';
/** Sun altitude below which Auto turns the red mode on (civil twilight has ended). */
export const AUTO_SUN_ALT = -6;

/** Class on <html> while red mode is on (not "night": that name is taken by the Dashboard's rows of nights). */
export const RED_CLASS = 'red-mode';
/** Run before the page paints (see layout), so a saved "on" never flashes bright first. */
export const NIGHT_BOOT = `try{if(localStorage.getItem('${NIGHT_KEY}')==='on')document.documentElement.classList.add('${RED_CLASS}')}catch(e){}`;

interface Ctx { setting: NightSetting; active: boolean; set: (s: NightSetting) => void; toggle: () => void }
const NightCtx = createContext<Ctx | null>(null);

export function NightModeProvider({ children }: { children: ReactNode }) {
  const { shownPlace } = useLocations();
  const [setting, setSetting] = useState<NightSetting>('off');
  // Until the saved setting is read, leave the boot script's class alone.
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    try { const v = localStorage.getItem(NIGHT_KEY); if (v === 'on' || v === 'auto') setSetting(v); } catch { /* storage unavailable */ }
    setLoaded(true);
    const id = setInterval(() => setNow(Date.now()), 6e4);
    return () => clearInterval(id);
  }, []);
  const dark = !!shownPlace && sunAltitude(now, shownPlace.lat, shownPlace.lon) < AUTO_SUN_ALT;
  const active = setting === 'on' || (setting === 'auto' && dark);
  useEffect(() => { if (loaded) document.documentElement.classList.toggle(RED_CLASS, active); }, [active, loaded]);
  const set = useCallback((s: NightSetting) => {
    setSetting(s);
    try { localStorage.setItem(NIGHT_KEY, s); } catch { /* storage unavailable */ }
  }, []);
  const value = useMemo<Ctx>(() => ({ setting, active, set, toggle: () => set(active ? 'off' : 'on') }), [setting, active, set]);
  return (
    <NightCtx.Provider value={value}>
      {children}
    </NightCtx.Provider>
  );
}

export function useNightMode(): Ctx {
  const v = useContext(NightCtx);
  if (!v) throw new Error('useNightMode must be used inside NightModeProvider');
  return v;
}

/**
 * The colour matrix behind html.red-mode: brightness becomes dim red; green and blue go to zero. Rendered
 * first in <body> (see layout), so it exists before anything that uses it is drawn.
 */
export const NightFilter = () => (
  <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
    <filter id="pl-night" colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values="0.21 0.42 0.07 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
    </filter>
  </svg>
);

/** Moon icon for the toggles (filled while red mode is on). */
export const MoonIcon = ({ on, size = 18 }: { on: boolean; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
);
