'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore, type Screen } from '../store';
import { useI18n } from '../i18n/I18n';
import { PHONE_QUERY } from '../lib/usePhone';

/** Screens that refresh on a pull from the top (the map and Sky view use dragging themselves). */
const SCREENS: Screen[] = ['home', 'alerts', 'account'];
/** How far (px, after resistance) the pull must go before letting go reloads. */
const THRESHOLD = 72;
const MAX = 110;
/** Touches that start in these keep their own gestures. */
const IGNORE = '.you-sheet-wrap, .gallery, .hscroll, input, textarea, select, [data-no-pull]';

/**
 * Pull to refresh on phones. The page turns off the browser's own pull-to-refresh
 * (overscroll-behavior-y: none) and the Android app's web view has none, so this draws an app-style
 * spinner and reloads the page once the pull passes the threshold.
 */
export function PullToRefresh() {
  const { screen } = useStore();
  const { t } = useI18n();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ y: number; x: number } | null>(null);
  const pulling = useRef(false);
  const dist = useRef(0);
  const on = SCREENS.includes(screen);

  useEffect(() => {
    if (!on) return;
    const reset = () => { start.current = null; pulling.current = false; dist.current = 0; setPull(0); };
    const down = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1 || !window.matchMedia(PHONE_QUERY).matches) return;
      if (window.scrollY > 0 || (e.target as Element | null)?.closest?.(IGNORE)) return;
      start.current = { y: e.touches[0].clientY, x: e.touches[0].clientX };
    };
    const move = (e: TouchEvent) => {
      const s = start.current;
      if (!s) return;
      const dy = e.touches[0].clientY - s.y, dx = e.touches[0].clientX - s.x;
      // A sideways swipe or an upward scroll is not a pull.
      if (!pulling.current && (Math.abs(dx) > Math.abs(dy) || dy <= 0 || window.scrollY > 0)) { if (Math.abs(dx) > 8 || dy < -4) start.current = null; return; }
      pulling.current = true;
      e.preventDefault();
      dist.current = Math.min(MAX, Math.max(0, dy) * 0.5);
      setPull(dist.current);
    };
    const up = () => {
      if (!pulling.current) { start.current = null; return; }
      if (dist.current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        start.current = null; pulling.current = false;
        window.location.reload();
        return;
      }
      reset();
    };
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
    document.addEventListener('touchcancel', reset);
    return () => {
      document.removeEventListener('touchstart', down);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', reset);
    };
  }, [on, refreshing]);

  if (!on || (pull === 0 && !refreshing)) return null;
  const ready = pull >= THRESHOLD;
  return (
    <div className={'ptr' + (refreshing ? ' ptr-busy' : ready ? ' ptr-ready' : '') + (pulling.current ? ' ptr-dragging' : '')} style={{ transform: `translate(-50%, ${pull - 48}px)` }}
      role="status" aria-label={refreshing ? t('ptr.refreshing') : ready ? t('ptr.release') : t('ptr.pull')}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ transform: refreshing ? undefined : `rotate(${Math.round((pull / THRESHOLD) * 270)}deg)` }}>
        <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
