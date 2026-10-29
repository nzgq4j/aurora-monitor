'use client';

import { useEffect } from 'react';
import { nativePlugin } from '../lib/native';

type SplashPlugin = { hide: (options?: { fadeOutDuration?: number }) => Promise<void> };

/**
 * In the Android app, hides the launch screen once this page is on screen. The app keeps it for at most
 * 3 seconds (mobile/capacitor.config.ts), so a slow connection never leaves a half-drawn page. A short
 * timer rather than an animation frame: while the launch screen shows, the app isn't drawing frames.
 */
export function NativeSplash() {
  useEffect(() => {
    const splash = nativePlugin<SplashPlugin>('SplashScreen');
    if (!splash) return;
    const id = setTimeout(() => { void splash.hide().catch(() => {}); }, 100);
    return () => clearTimeout(id);
  }, []);
  return null;
}
