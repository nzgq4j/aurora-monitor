'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth';
import { useLocations } from '../lib/locations';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';
import { rank } from '../lib/badges';
import { feed, fileUrl, myBlocks, unblock, type Filter, type Photo } from '../lib/community';
import { BottomSheet } from '../components/BottomSheet';
import type { MessageKey } from '../i18n/core';

const FILTERS: Filter[] = ['tonight', 'storm', 'near', 'top'];
const CAMERA = 'M4 8h3l1.6-2.4h6.8L17 8h3v11H4zM12 16.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z';
const PLUS = 'M12 5v14M5 12h14';
const HEART = 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z';

export const Svg = ({ d, size = 20, fill = false }: { d: string; size?: number; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
    <path d={d} fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Kp as the scale's thirds (6.67 → 7-, 5.33 → 5+). */
export const kpThirds = (kp: number) => {
  const whole = Math.round(kp), frac = kp - whole;
  return `${whole}${frac > 0.15 ? '+' : frac < -0.15 ? '-' : ''}`;
};
export const kpColor = (kp: number | null) => (kp == null ? 'var(--muted)' : kp >= 6.66 ? 'var(--red)' : kp >= 4.66 ? 'var(--amber)' : 'var(--soft)');

/** One photo in the feed. */
export function PhotoCard({ p }: { p: Photo }) {
  const { t, date } = useI18n();
  return (
    <Link href={`/gallery/photo?id=${p.id}`} className="gal-card">
      <div className="gal-card-img" style={{ aspectRatio: p.width && p.height ? `${p.width} / ${p.height}` : '4 / 3' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- public storage files, already sized */}
        <img src={fileUrl(p.thumb_path)} alt={p.caption || t('gal.photoAlt', { place: p.place ?? '' })} loading="lazy" />
        {p.kp != null && <span className="gal-chip gal-chip-kp mono" style={{ color: kpColor(p.kp) }}>KP {kpThirds(p.kp)}</span>}
        <span className={'gal-chip gal-chip-src' + (p.source === 'app' ? ' is-app' : '')}>{t(p.source === 'app' ? 'gal.captured' : 'gal.uploaded')}</span>
        {p.featured && <span className="gal-chip gal-chip-feat">{t('gal.featured')}</span>}
      </div>
      <div className="gal-card-body">
        <div className="gal-card-row">
          <span className="gal-card-place">{p.place ?? t('gal.noPlace')}</span>
          <span className="gal-card-time mono">{date(p.taken_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="gal-card-row gal-card-meta">
          <span>{p.handle} · <span className="hl">{t(`rank.${rank(p.points).id}` as MessageKey)}</span></span>
          <span className="gal-card-likes" aria-label={t('gal.helpfulCount', { n: p.helpful })}><Svg d={HEART} size={16} fill={p.voted} />{p.helpful}</span>
        </div>
      </div>
    </Link>
  );
}

/** The community gallery (the Sky tab): members' aurora photos, with Sky view's camera a tap away. */
export function Gallery({ kp }: { kp: number | null }) {
  const { go } = useStore();
  const { user } = useAuth();
  const { locations } = useLocations();
  const { t, tn, num } = useI18n();
  const [filter, setFilter] = useState<Filter | 'mine'>('tonight');
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blocks, setBlocks] = useState<string[] | null>(null);
  const home = locations.find(l => l.isHome) ?? locations[0] ?? null;

  // Only the latest request may update the list (switching filters quickly mustn't show an older answer).
  const request = useRef(0);
  const load = useCallback(async (offset = 0) => {
    const id = ++request.current;
    if (filter === 'near' && !home) { setPhotos([]); return; }
    setFailed(false);
    const r = await feed(filter, { lat: home?.lat, lon: home?.lon, offset, limit: 24 });
    if (id !== request.current) return;
    if (!r) { setFailed(true); if (!offset) setPhotos([]); return; }
    setMore(r.length === 24);
    setPhotos(prev => (offset ? [...(prev ?? []), ...r] : r));
  }, [filter, home?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- the home place, not each new locations array
  useEffect(() => { setPhotos(null); void load(); }, [load]);

  const storm = kp != null && kp >= 4.66;
  return (
    <main className="wrap gal" data-screen-label="Gallery">
      <div className="gal-head">
        <h1 className="you-title">{t('gal.title')}</h1>
        <div className="gal-head-actions">
          <button type="button" className="btn gal-icon-btn gal-camera" onClick={() => go('sky')} aria-label={t('gal.openCamera')}><Svg d={CAMERA} size={22} /></button>
          {user
            ? <Link href="/gallery/post" className="gal-post"><Svg d={PLUS} size={18} />{t('gal.post')}</Link>
            : <button type="button" className="btn gal-post" onClick={() => go('signin')}><Svg d={PLUS} size={18} />{t('gal.post')}</button>}
        </div>
      </div>

      <div className="gal-chips" role="group" aria-label={t('gal.filter')}>
        {[...FILTERS, ...(user ? ['mine' as const] : [])].map(f => (
          <button key={f} type="button" className={'btn gal-filter' + (filter === f ? ' on' : '')} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`gal.f.${f}` as MessageKey)}
          </button>
        ))}
      </div>

      {storm && (
        <div className="gal-storm" role="status">
          <span className="gal-storm-dot" aria-hidden="true" />
          <span><b>{t('gal.stormNow', { kp: num(kp!, 1) })}</b>{filter === 'tonight' && photos ? ` · ${tn('gal.tonightCount', photos.length)}` : ''}</span>
        </div>
      )}

      {photos === null && <p className="gal-empty">{t('gal.loading')}</p>}
      {photos && !photos.length && (
        <div className="gal-empty">
          <p>{failed ? t('gal.failed') : filter === 'near' && !home ? t('gal.noHome') : t(`gal.empty.${filter}` as MessageKey)}</p>
          {filter !== 'top' && !failed && <button type="button" className="btn pill pill-ghost sheet-pill" onClick={() => setFilter('top')}>{t('gal.seeTop')}</button>}
        </div>
      )}
      {photos && photos.length > 0 && (
        <div className="gal-grid">
          {photos.map(p => <PhotoCard key={p.id} p={p} />)}
        </div>
      )}
      {more && photos && <button type="button" className="btn pill pill-ghost sheet-pill gal-more" onClick={() => load(photos.length)}>{t('gal.more')}</button>}

      <p className="gal-foot">
        {t('gal.rules')}{' '}
        <Link href="/terms#community">{t('gal.rulesLink')}</Link>
        {user && <> · <button type="button" className="btn gal-link" onClick={async () => setBlocks(await myBlocks())}>{t('gal.blocked')}</button></>}
      </p>
      {blocks && (
        <BottomSheet title={t('gal.blocked')} onClose={() => setBlocks(null)}>
          {!blocks.length && <p className="you-sheet-text">{t('gal.noBlocks')}</p>}
          {blocks.map(h => (
            <div key={h} className="gal-block-row">
              <span>{h}</span>
              <button type="button" className="btn pill pill-ghost sheet-pill" onClick={async () => { if (await unblock(h)) { setBlocks(b => b?.filter(x => x !== h) ?? null); void load(); } }}>{t('gal.unblock')}</button>
            </div>
          ))}
        </BottomSheet>
      )}
    </main>
  );
}
