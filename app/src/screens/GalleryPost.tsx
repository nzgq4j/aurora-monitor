'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { useLocations, devicePlace } from '../lib/locations';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';
import { getPhoto, type GalleryPhoto as LocalPhoto } from '../lib/gallery';
import { myMember, placeNames, postPhoto, type Precision } from '../lib/community';
import { HandleSheet } from './Badges';
import { useCamera } from './GalleryPhoto';
import { kpThirds } from './Gallery';
import type { MessageKey } from '../i18n/core';

const PRECISIONS: Precision[] = ['town', 'area', 'none'];

/**
 * Post a photo to the community gallery: one from Sky view's on-device gallery (?local=<id>, which knows
 * where, when and how it was taken) or a photo chosen from the device (marked Uploaded). The photo is
 * re-encoded before upload, which drops its metadata (GPS included); the place is shown only as precisely
 * as the member chooses.
 */
export function GalleryPost() {
  const router = useRouter();
  const { go } = useStore();
  const { user, ready } = useAuth();
  const { locations } = useLocations();
  const { t } = useI18n();
  const camera = useCamera();
  const [local, setLocal] = useState<LocalPhoto | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [names, setNames] = useState<{ town: string | null; area: string | null } | null>(null);
  const [precision, setPrecision] = useState<Precision>('town');
  const [caption, setCaption] = useState('');
  const [mine, setMine] = useState(false);
  const [handle, setHandleName] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('local');
    if (id) void getPhoto(id).then(p => {
      if (!p) return;
      setLocal(p);
      if (p.meta?.lat != null && p.meta.lon != null) setPos({ lat: p.meta.lat, lon: p.meta.lon });
    }).catch(() => {});
  }, []);
  useEffect(() => { if (user) void myMember().then(m => setHandleName(m?.handle ?? null)); }, [user]);
  useEffect(() => {
    if (!pos) { setNames(null); return; }
    void placeNames(pos.lat, pos.lon).then(setNames);
  }, [pos]);

  const blob = local?.photo ?? file;
  const preview = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (ready && !user) {
    return (
      <main className="wrap gal">
        <h1 className="you-title">{t('post.title')}</h1>
        <p className="you-sheet-text">{t('post.signedOut')}</p>
        <button type="button" className="btn pill pill-primary sheet-pill" onClick={() => go('signin')}>{t('nav.signIn')}</button>
      </main>
    );
  }

  const home = locations.find(l => l.isHome) ?? null;
  const takenAt = local?.taken ?? (file ? Math.min(Date.now(), file.lastModified || Date.now()) : Date.now());
  const place = precision === 'town' ? names?.town ?? names?.area : precision === 'area' ? names?.area : null;
  const useDevice = async () => {
    setLocating(true);
    try { const d = await devicePlace(); setPos({ lat: d.lat, lon: d.lon }); } catch { setErr(t('post.noLocation')); }
    setLocating(false);
  };
  const submit = async () => {
    if (!blob || !mine || busy) return;
    setBusy(true); setErr('');
    const r = await postPhoto({
      photo: blob, caption, place: place ?? null, lat: pos?.lat ?? null, lon: pos?.lon ?? null,
      precision: pos ? precision : 'none', takenAt, source: local ? 'app' : 'upload', camera: local?.meta?.camera ?? null,
    });
    setBusy(false);
    if (r.ok) router.replace(`/gallery/photo?id=${r.id}`);
    else setErr(t(r.reason === 'limit' ? 'post.limit' : r.reason === 'signin' ? 'post.signedOut' : 'post.failed'));
  };

  return (
    <main className="wrap gal gal-post-page">
      <div className="gal-post-bar">
        <Link href="/gallery" className="gal-link">{t('common.cancel')}</Link>
        <h1 className="you-bar-title">{t('post.title')}</h1>
        <span style={{ width: 52 }} />
      </div>

      {!blob ? (
        <label className="gal-pick">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <span className="hl">{t('post.choose')}</span>
          <small>{t('post.chooseHint')}</small>
        </label>
      ) : (
        <div className="gal-post-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
          {preview && <img src={preview} alt={t('post.preview')} />}
          <div>
            <span className={local ? 'hl' : ''} style={{ fontWeight: 600 }}>{t(local ? 'gal.captured' : 'gal.uploaded')}</span>
            {local?.meta?.camera && <span>{camera(local.meta.camera)}</span>}
            {local?.meta?.kp != null && <span>Kp {kpThirds(local.meta.kp)}</span>}
            {!local && <button type="button" className="btn gal-link" onClick={() => setFile(null)}>{t('post.another')}</button>}
          </div>
        </div>
      )}

      <label className="field">
        <span className="label">{t('post.caption')}</span>
        <textarea className="input" rows={3} maxLength={280} value={caption} placeholder={t('post.captionHint')} onChange={e => setCaption(e.target.value)} />
      </label>

      <fieldset className="gal-where">
        <legend className="label">{t(pos ? 'post.where' : 'post.noPos')}</legend>
        {!pos && (
          <div className="gal-where-pick">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn pill pill-ghost sheet-pill" disabled={locating} onClick={useDevice}>{t('post.here')}</button>
              {home && <button type="button" className="btn pill pill-ghost sheet-pill" onClick={() => setPos({ lat: home.lat, lon: home.lon })}>{t('post.home', { place: home.name })}</button>}
            </div>
          </div>
        )}
        {pos && PRECISIONS.map(p => (
          <label key={p} className={'gal-radio' + (precision === p ? ' on' : '')}>
            <input type="radio" name="where" checked={precision === p} onChange={() => setPrecision(p)} />
            <span>
              <b>{t(`post.prec.${p}` as MessageKey)}</b>
              <small>{p === 'none' ? t('post.prec.noneHint') : (p === 'town' ? names?.town ?? names?.area : names?.area) ?? t('post.finding')}</small>
            </span>
          </label>
        ))}
      </fieldset>

      {handle && (
        <p className="you-sheet-text" style={{ margin: 0 }}>
          {t('post.as', { handle })} <button type="button" className="btn gal-link" onClick={() => setNaming(true)}>{t('badges.change')}</button>
        </p>
      )}
      <label className="gal-confirm">
        <input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} />
        <span>{t('post.mine')} <a href="/terms#community">{t('gal.rulesLink')}</a></span>
      </label>
      <p className="gal-note">{t('post.privacy')}</p>
      {err && <p className="gal-note" role="alert" style={{ color: 'var(--red)' }}>{err}</p>}
      <button type="button" className="btn pill pill-primary sheet-pill gal-submit" disabled={!blob || !mine || busy} onClick={submit}>
        {busy ? t('post.posting') : t('post.submit')}
      </button>
      {naming && handle && <HandleSheet current={handle} onClose={() => setNaming(false)} onSaved={h => { setHandleName(h); setNaming(false); }} />}
    </main>
  );
}
