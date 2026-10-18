'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { KpPoint } from '../lib/feeds';
import { useLocations, type Place } from '../lib/locations';
import { usePointVerdict } from '../lib/usePointVerdict';
import { useStore } from '../store';
import { INTL_TAG } from '../i18n/config';
import { useI18n } from '../i18n/I18n';
import { LEVEL_COLOR, scoreColor } from './Tonight';

type Snap = 'peek' | 'half' | 'full';
/** Collapsed height in px; half and full open are shares of the map's height. */
const PEEK = 96, HALF = 0.5, FULL = 0.88;
const NEXT: Record<Snap, Snap> = { peek: 'half', half: 'full', full: 'peek' };

const near = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.abs(a.lat - b.lat) < 0.01 && Math.abs(((a.lon - b.lon + 540) % 360) - 180) < 0.01;

function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

interface Props {
  kp: number | null;
  series: KpPoint[];
  /** The point tapped on the map, if any; otherwise the panel is about the user's location. */
  pick: Place | null;
  onClear: () => void;
  /** Layer controls and legend: inside the panel on phones (the header row and the map corner hold them on larger screens). */
  layers: ReactNode;
  legend: ReactNode;
}

/**
 * The map's answer to "can I see it from here?": the verdict for the tapped point or your location.
 * On phones a pull-up sheet (collapsed, half or fully open) that also holds the layers; on larger
 * screens a card in the corner of the map.
 */
export function MapPanel({ kp, series, pick, onClear, layers, legend }: Props) {
  const { t, num, locale } = useI18n();
  const { plan } = useStore();
  const { shownPlace, locations, add, saveAsHome, setHome, setViewPlace, error: locError } = useLocations();
  const phone = usePhone();
  const place: (Place & { isHome?: boolean }) | null = pick ?? shownPlace;
  const { loading, result, cond } = usePointVerdict(place, kp, series);
  const saved = place ? locations.find(l => near(l, place)) ?? null : null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => setMsg(''), [pick]);

  // Sheet height: snapped, or following the finger while dragged.
  const [snap, setSnap] = useState<Snap>('peek');
  const [drag, setDrag] = useState<number | null>(null);
  const [boxH, setBoxH] = useState(0);
  const sheet = useRef<HTMLElement>(null);
  useEffect(() => {
    const box = sheet.current?.parentElement;
    if (!box) return;
    const ro = new ResizeObserver(() => setBoxH(box.clientHeight));
    ro.observe(box);
    return () => ro.disconnect();
  }, [phone]);
  const heightOf = (s: Snap) => (s === 'peek' ? PEEK : Math.max(PEEK, Math.round(boxH * (s === 'half' ? HALF : FULL))));
  const gesture = useRef<{ y: number; h: number; t: number; moved: boolean } | null>(null);
  const onDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { y: e.clientY, h: heightOf(snap), t: performance.now(), moved: false };
  };
  const onMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dy = e.clientY - g.y;
    if (Math.abs(dy) > 5) g.moved = true;
    if (g.moved) setDrag(Math.max(PEEK, Math.min(heightOf('full'), g.h - dy)));
  };
  const onUp = (e: ReactPointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setDrag(null);
    if (!g) return;
    if (!g.moved) { setSnap(NEXT[snap]); return; }
    // Snap to the nearest height, nudged by a flick.
    const h = g.h - (e.clientY - g.y), v = (g.y - e.clientY) / Math.max(1, performance.now() - g.t);
    const aim = h + v * 220;
    setSnap((['peek', 'half', 'full'] as Snap[]).reduce((a, b) => (Math.abs(heightOf(b) - aim) < Math.abs(heightOf(a) - aim) ? b : a)));
  };

  const time = (x: number) => new Date(x).toLocaleTimeString(INTL_TAG[locale], { hour: '2-digit', minute: '2-digit' });
  const hourLabel = (x: number) => new Date(x).toLocaleTimeString(INTL_TAG[locale], { hour: '2-digit', hourCycle: 'h23' }).replace(/\D+$/, '');
  const v = result?.v, h0 = result?.hours[0];
  const name = place ? place.name.split(',')[0] : '';

  const doSave = async (home: boolean) => {
    if (!place) return;
    setBusy(true); setMsg('');
    const spot = { name: place.name, lat: place.lat, lon: place.lon, source: 'manual' as const };
    let ok: boolean;
    if (home) {
      if (saved) { await setHome(saved.id); ok = true; } else ok = !!(await saveAsHome(spot, plan.locs));
      if (ok) setViewPlace(null);
    } else ok = locations.length < plan.locs ? !!(await add(spot)) : (setMsg(t('loc.err.limit')), false);
    setBusy(false);
    if (ok) setMsg(t(home ? 'map.panel.homeDone' : 'map.panel.saveDone'));
  };

  const head = (
    <div className="map-panel-head">
      <span className="map-panel-place">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill={pick ? '#fff' : 'none'} stroke="currentColor" strokeWidth="2" /></svg>
        <b>{name || t('map.panel.title')}</b>
        {saved && <small>{t(saved.isHome ? 'map.panel.home' : 'map.panel.saved')}</small>}
      </span>
      {v && <span className="map-panel-verdict" style={{ color: LEVEL_COLOR[v.level] }}>{t(`tonight.level.${v.level}`)} <span className="mono">{v.score}</span></span>}
    </div>
  );
  const line = !place ? t('map.panel.hint')
    : !v || !h0 ? (loading || !cond ? t('sky.checking') : t('common.noData'))
    : [v.window ? t('tonight.best', { from: time(v.window.from), to: time(v.window.to) }) : t('tonight.noWindow'),
      h0.cloud !== null ? t('tonight.badge.cloud', { pct: h0.cloud }) : '',
      cond?.sun.dark ? t('tonight.badge.dark') : ''].filter(Boolean).join(' · ');

  const details = place && result && (
    <>
      <div className="map-panel-section">
        <span className="label">{t('tonight.next12')}</span>
        <div className="tonight-bars" role="group" aria-label={t('tonight.aria.bars')}>
          {result.hours.map(h => (
            <span key={h.t} role="img" aria-label={t('map.panel.hour', { time: time(h.t), score: h.score })}>
              <span className="tonight-bar"><i style={{ height: `${Math.max(6, h.score)}%`, background: scoreColor(h.score) }} /></span>
              <span className="mono">{hourLabel(h.t)}</span>
            </span>
          ))}
        </div>
      </div>
      {!saved?.isHome && (
        <div className="map-panel-actions">
          {!saved && <button type="button" className="btn pill pill-ghost" disabled={busy} onClick={() => doSave(false)}>{t('map.panel.save')}</button>}
          <button type="button" className="btn pill pill-primary" disabled={busy} onClick={() => doSave(true)}>{t('map.panel.setHome')}</button>
        </div>
      )}
      {(msg || locError) && <span role="status" className="map-panel-msg">{msg || locError}</span>}
      {kp !== null && <span className="map-panel-note">{t('tonight.badge.kp', { kp: num(kp, 1) })} · {t('tonight.note')}</span>}
    </>
  );

  if (!phone) {
    return (
      <section className="map-card" aria-label={t('map.panel.label')}>
        {head}
        <span className="map-panel-line">{line}</span>
        {pick && <button type="button" className="btn map-panel-clear" onClick={onClear} aria-label={t('map.panel.clear')}>×</button>}
        {details}
      </section>
    );
  }

  const h = drag ?? heightOf(snap);
  return (
    <section ref={sheet} className={'map-sheet' + (drag !== null ? ' dragging' : '')} style={{ height: h }} aria-label={t('map.panel.label')}>
      <div className="map-sheet-grip" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <button type="button" className="btn map-sheet-handle" aria-expanded={snap !== 'peek'}
          aria-label={t(snap === 'full' ? 'map.panel.collapse' : 'map.panel.expand')}
          onClick={e => { if (e.detail === 0) setSnap(NEXT[snap]); /* keyboard; taps go through the grip */ }}>
          <i />
        </button>
        {head}
        <span className="map-panel-line">{line}</span>
      </div>
      {pick && <button type="button" className="btn map-panel-clear" onClick={onClear} aria-label={t('map.panel.clear')}>×</button>}
      <div className="map-sheet-body" hidden={snap === 'peek' && drag === null}>
        <div className="map-panel-section">
          <span className="label">{t('map.panel.layers')}</span>
          {layers}
        </div>
        {details}
        {legend}
      </div>
    </section>
  );
}
