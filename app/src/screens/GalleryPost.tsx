'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { useLocations, devicePlace, searchPlaces, type PlaceResult } from '../lib/locations';
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
  // "Other": search for a place, or pick one of the member's other saved places.
  const [other, setOther] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');

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
  const others = locations.filter(l => !l.isHome);
  const pick = (p: { lat: number; lon: number }) => { setPos({ lat: p.lat, lon: p.lon }); setOther(false); setResults(null); setQ(''); setSearchMsg(''); };
  const useDevice = async () => {
    setLocating(true); setErr(''); setOther(false);
    try { pick(await devicePlace()); } catch { setErr(t('post.noLocation')); }
    setLocating(false);
  };
  const search = async (e: FormEvent) => {
    e.preventDefault();
    setSearching(true); setSearchMsg('');
    try { const r = await searchPlaces(q); setResults(r); if (!r.length) setSearchMsg(t('search.none')); }
    catch { setSearchMsg(t('search.unavailable')); }
    finally { setSearching(false); }
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
              <button type="button" className="btn pill pill-ghost sheet-pill" disabled={locating} onClick={useDevice}>{locating ? '…' : t('post.here')}</button>
              {home && <button type="button" className="btn pill pill-ghost sheet-pill" title={home.name} onClick={() => pick(home)}>{t('post.home')}</button>}
              <button type="button" className={'btn pill sheet-pill ' + (other ? 'pill-primary' : 'pill-ghost')} aria-expanded={other} onClick={() => setOther(o => !o)}>{t('post.other')}</button>
            </div>
            {other && (
              <>
                {others.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {others.map(l => <button key={l.id} type="button" className="btn pill pill-ghost sheet-pill" onClick={() => pick(l)}>{l.name}</button>)}
                  </div>
                )}
                <form onSubmit={search} style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                  <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} style={{ padding: 11 }} />
                  <button type="submit" className="btn pill pill-ghost" disabled={searching || q.trim().length < 2} style={{ fontSize: 14, padding: '0 16px', flex: 'none' }}>{searching ? '…' : t('search.button')}</button>
                </form>
                {searchMsg && <p className="gal-note" role="status" style={{ margin: 0 }}>{searchMsg}</p>}
                {results && results.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {results.map(r => (
                      <li key={`${r.lat},${r.lon}`}>
                        <button type="button" className="btn" onClick={() => pick(r)}
                          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                          <span style={{ fontWeight: 700 }}>{r.name}</span><span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>{r.detail}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
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
        {pos && <button type="button" className="btn gal-link" style={{ alignSelf: 'flex-start' }} onClick={() => { setPos(null); setPrecision('town'); }}>{t('post.changePlace')}</button>}
      </fieldset>

      {handle && (
        <p className="you-sheet-text" style={{ margin: 0 }}>
          {t('post.as', { handle })} <button type="button" className="btn gal-link" onClick={() => setNaming(true)}>{t('badges.change')}</button>
        </p>
      )}
      <label className="gal-confirm">
        <input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} />
        <span>{t('post.mine')} <Link href="/terms#community">{t('gal.rulesLink')}</Link></span>
      </label>
      <p className="gal-note">{t('post.privacy')}</p>
      <p className="gal-note">{t('post.review')}</p>
      {err && <p className="gal-note" role="alert" style={{ color: 'var(--red)' }}>{err}</p>}
      <button type="button" className="btn pill pill-primary sheet-pill gal-submit" disabled={!blob || !mine || busy} onClick={submit}>
        {busy ? t('post.posting') : t('post.submit')}
      </button>
      {naming && handle && <HandleSheet current={handle} onClose={() => setNaming(false)} onSaved={h => { setHandleName(h); setNaming(false); }} />}
    </main>
  );
}
