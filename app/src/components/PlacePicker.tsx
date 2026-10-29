'use client';

import { useState, type FormEvent } from 'react';
import { devicePlace, searchPlaces, useLocations, type Place, type PlaceResult } from '../lib/locations';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';
import { BottomSheet } from './BottomSheet';

/** The rest of a place's name after the town (region, country). */
export const placeDetail = (name: string) => name.split(',').slice(1).map(x => x.trim()).filter(Boolean).join(', ');

const Check = () => (
  <span style={{ color: 'var(--green)', display: 'flex' }}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
);

export type Found = Place & { source: 'manual' | 'device' };

/**
 * The one place picker on Now (Tonight card and Your sky): your saved places, then "Another place…" to find one
 * by device location or search. A found place is only shown, unless you choose Save as Home; adding, removing
 * and choosing Home among saved places stay in You → Saved locations. Opens on the search when nothing is saved.
 */
export function PlacePicker({ onClose }: { onClose: () => void }) {
  const { t, tn } = useI18n();
  const { plan, go } = useStore();
  const { locations, shownPlace, setViewPlace, saveAsHome, error } = useLocations();
  const places = [...locations].sort((x, y) => Number(y.isHome) - Number(x.isHome));
  const savedShown = shownPlace ? places.find(l => l.lat === shownPlace.lat && l.lon === shownPlace.lon && (l.isHome || !shownPlace.isHome)) : undefined;
  const [view, setView] = useState<'list' | 'find'>(places.length ? 'list' : 'find');
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pick = (id: string) => {
    const l = places.find(x => x.id === id);
    if (l) setViewPlace(l.isHome ? null : { name: l.name, lat: l.lat, lon: l.lon });
    onClose();
  };
  const show = (p: Place) => { setViewPlace({ name: p.name, lat: p.lat, lon: p.lon }); onClose(); };
  const saveHome = async (p: Found) => {
    setBusy(true); setMsg(null);
    const saved = await saveAsHome(p, plan.locs);
    setBusy(false);
    if (!saved) return;
    setViewPlace(null);
    onClose();
  };
  const manage = () => { onClose(); go('account', { tab: 'locations' }); };

  const title = view === 'list' ? t('you.locations') : t('place.find');
  return (
    <BottomSheet title={title} onClose={onClose}>
      {view === 'list' ? (
        <div className="you-group-rows">
          {shownPlace && !savedShown && (
            <button type="button" className="btn you-row" aria-pressed onClick={onClose}>
              <span className="you-row-label sun-lapse-option"><b>{shownPlace.name.split(',')[0]}</b><small>{placeDetail(shownPlace.name)}</small></span>
              <Check />
            </button>
          )}
          {places.map(l => (
            <button key={l.id} type="button" className="btn you-row" aria-pressed={savedShown?.id === l.id} onClick={() => pick(l.id)}>
              <span className="you-row-label sun-lapse-option">
                <b>{l.name.split(',')[0]}</b>
                <small>{[l.isHome ? t('map.panel.home') : '', placeDetail(l.name)].filter(Boolean).join(' · ')}</small>
              </span>
              {savedShown?.id === l.id && <Check />}
            </button>
          ))}
          <button type="button" className="btn you-row" onClick={() => setView('find')}>
            <span className="you-row-label">{t('tonight.otherPlace')}</span>
          </button>
          <button type="button" className="btn you-row" onClick={manage}>
            <span className="you-row-label" style={{ color: 'var(--muted)' }}>{t('place.manage')}</span>
          </button>
        </div>
      ) : found ? (
        // A place has been found: show it for now, or make it Home.
        <div className="place-found">
          <div className="sun-lapse-option"><b>{found.name.split(',')[0]}</b><small>{placeDetail(found.name)}</small></div>
          <button type="button" className="btn pill pill-primary" disabled={busy} onClick={() => show(found)}>{t('place.show')}</button>
          <small>{t('sky.visitOnly')}</small>
          <button type="button" className="btn pill pill-ghost" disabled={busy} onClick={() => saveHome(found)}>{busy ? '…' : t('sky.saveHome')}</button>
          <small>{locations.length >= plan.locs ? t('sky.replacesHome', { plan: t(`tier.${plan.id}`), locs: tn('sky.locs', plan.locs) }) : t('sky.adds')}</small>
          {(msg || error) && <span role="status" className="place-msg">{msg || error}</span>}
          <button type="button" className="btn place-back" onClick={() => setFound(null)}>{t('you.back')}</button>
        </div>
      ) : (
        <div className="place-find">
          <PlaceSearch onFound={setFound} />
          {places.length > 0 && <button type="button" className="btn place-back" onClick={() => setView('list')}>{t('you.back')}</button>}
        </div>
      )}
    </BottomSheet>
  );
}

/**
 * Find a place by the device's location or by searching for a town (Open-Meteo geocoding). Shared by the place
 * picker and the introduction's place step; what happens to the place found is up to them.
 */
export function PlaceSearch({ onFound, disabled = false }: { onFound: (p: Found) => void; disabled?: boolean }) {
  const { t, tx } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState<'device' | 'search' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const off = disabled || !!busy;

  const useDevice = async () => {
    setBusy('device'); setMsg(null);
    try { const p = await devicePlace(); setBusy(null); onFound({ ...p, source: 'device' }); }
    catch (e) { setBusy(null); setMsg(tx((e as Error).message)); }
  };
  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('search'); setMsg(null);
    try { const r = await searchPlaces(q); setResults(r); if (!r.length) setMsg(t('search.none')); }
    catch { setMsg(t('search.unavailable')); }
    finally { setBusy(null); }
  };

  return (
    <>
      <button type="button" className="btn pill pill-primary place-device" disabled={off} onClick={useDevice}>{busy === 'device' ? t('loc.finding') : t('loc.useCurrent')}</button>
      <span className="place-or">{t('common.or')}</span>
      <form onSubmit={search} className="intro-search">
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} />
        <button type="submit" className="btn pill pill-ghost" disabled={off || q.trim().length < 2}>{busy === 'search' ? '…' : t('search.button')}</button>
      </form>
      {results && results.length > 0 && (
        <ul className="intro-results">
          {results.map(r => (
            <li key={`${r.lat},${r.lon}`}>
              <button type="button" className="btn" disabled={off}
                onClick={() => onFound({ name: r.detail ? `${r.name}, ${r.detail.split(', ')[0]}` : r.name, lat: r.lat, lon: r.lon, source: 'manual' })}>
                <b>{r.name}</b><span>{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <span role="status" className="place-msg">{msg}</span>}
    </>
  );
}
