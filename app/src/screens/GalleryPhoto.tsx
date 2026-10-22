'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';
import { rank } from '../lib/badges';
import { blockOwner, feed, fileUrl, myMember, onePhoto, removePhoto, reportPhoto, toggleHelpful, type Photo, type ReportReason } from '../lib/community';
import { BottomSheet } from '../components/BottomSheet';
import { Svg, kpColor, kpThirds } from './Gallery';
import type { MessageKey } from '../i18n/core';

const BACK = 'M15 5l-7 7 7 7';
const HEART = 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z';
const CHECK = 'M20 6L9 17l-5-5';
const REASONS: ReportReason[] = ['not_aurora', 'inappropriate', 'spam', 'not_theirs', 'other'];
const G = (kp: number) => (kp >= 8.66 ? 5 : kp >= 7.66 ? 4 : kp >= 6.66 ? 3 : kp >= 5.66 ? 2 : kp >= 4.66 ? 1 : 0);

/** Camera settings saved with a photo: "night|4|24" (stacked frames), "long|10|1600" (exposure, ISO) or "photo". */
export function useCamera() {
  const { t, num } = useI18n();
  return (code: string | null) => {
    if (!code) return null;
    const [kind, a, b] = code.split('|');
    if (kind === 'night') return t('gal.cam.night', { s: num(Number(a), 0), n: Number(b) || 0 });
    if (kind === 'long') return t('gal.cam.long', { s: num(Number(a), 1), iso: Number(b) || 0 });
    if (kind === 'photo') return t('gal.cam.photo');
    return code;
  };
}

/** One gallery photo, its details, and Helpful / Share / Report / Block (or Remove, for one's own). */
export function GalleryPhoto() {
  const router = useRouter();
  const { go } = useStore();
  const { user } = useAuth();
  const { t, num, date } = useI18n();
  const camera = useCamera();
  const [id, setId] = useState<string | null>(null);
  const [p, setP] = useState<Photo | null | undefined>(undefined);
  const [around, setAround] = useState<Photo[]>([]);
  const [admin, setAdmin] = useState(false);
  const [sheet, setSheet] = useState<null | 'report' | 'block' | 'remove'>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setId(new URLSearchParams(window.location.search).get('id')); }, []);
  useEffect(() => {
    if (!id) return;
    setP(undefined); setAround([]);
    void onePhoto(id).then(x => {
      setP(x);
      if (x) void feed('around', { at: x.taken_at, id: x.id, limit: 9 }).then(r => setAround(r ?? []));
    });
  }, [id, user]);
  useEffect(() => { if (user) void myMember().then(m => setAdmin(!!m?.isAdmin)); }, [user]);

  if (p === undefined) return <main className="wrap gal"><p className="gal-empty">{t('gal.loading')}</p></main>;
  if (p === null) {
    return (
      <main className="wrap gal">
        <p className="gal-empty">{t('gal.gone')}</p>
        <Link href="/gallery" className="btn pill pill-ghost sheet-pill">{t('gal.back')}</Link>
      </main>
    );
  }

  const helpful = async () => {
    if (!user) { go('signin'); return; }
    if (p.mine || busy) return;
    setBusy(true);
    const r = await toggleHelpful(p.id);
    setBusy(false);
    if (r) setP({ ...p, helpful: r.helpful, voted: r.voted });
  };
  const share = async () => {
    const url = `${window.location.origin}/gallery/photo?id=${p.id}`;
    try {
      if (navigator.share) await navigator.share({ title: t('gal.shareTitle'), url });
      else { await navigator.clipboard.writeText(url); setNote(t('gal.copied')); }
    } catch { /* cancelled */ }
  };
  const feature = async () => {
    const { supabase } = await import('../lib/supabase');
    const s = (await supabase()?.auth.getSession())?.data.session;
    const res = await fetch('/api/gallery/moderate', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s?.access_token}` }, body: JSON.stringify({ photoId: p.id, action: p.featured ? 'unfeature' : 'feature' }) });
    if (res.ok) setP({ ...p, featured: !p.featured });
  };
  const g = p.kp != null ? G(p.kp) : 0;
  const facts: [string, string][] = [
    [t('gal.taken'), date(p.taken_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
    [t('gal.place'), p.place ? (p.lat != null && Number.isInteger(p.lat) ? t('gal.placeArea', { place: p.place }) : t('gal.placeTown', { place: p.place })) : t('gal.noPlace')],
  ];
  if (p.kp != null) facts.push([t('gal.kpThen'), g ? t('gal.kpStorm', { kp: kpThirds(p.kp), g }) : kpThirds(p.kp)]);
  const cam = camera(p.camera);
  if (cam) facts.push([t('gal.camera'), cam]);

  return (
    <main className="wrap gal gal-photo">
      <div className="gal-photo-img">
        {/* eslint-disable-next-line @next/next/no-img-element -- public storage file */}
        <img src={fileUrl(p.path)} alt={p.caption || t('gal.photoAlt', { place: p.place ?? '' })} />
        <button type="button" className="btn gal-icon-btn gal-photo-back" onClick={() => (window.history.length > 1 ? router.back() : go('gallery'))} aria-label={t('gal.back')}><Svg d={BACK} size={22} /></button>
        <span className={'gal-chip gal-chip-mark' + (p.source === 'app' ? ' is-app' : '')}>{p.source === 'app' && <Svg d={CHECK} size={14} />}{t(p.source === 'app' ? 'gal.captured' : 'gal.uploaded')}</span>
      </div>

      <div className="gal-author">
        <div>
          <div className="gal-author-name">{p.handle}{p.featured && <span className="gal-chip gal-chip-feat inline">{t('gal.featured')}</span>}</div>
          <div className="gal-author-rank hl">{t(`rank.${rank(p.points).id}` as MessageKey)}</div>
        </div>
        {p.kp != null && <span className="mono gal-author-kp" style={{ color: kpColor(p.kp) }}>KP {kpThirds(p.kp)}</span>}
      </div>
      {p.status === 'pending' && <p className="gal-note" role="status">{t('gal.pendingNote')}</p>}
      {p.caption && <p className="gal-caption">{p.caption}</p>}

      <dl className="gal-facts">
        {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>

      <div className="gal-actions">
        <button type="button" className={'btn gal-action' + (p.voted ? ' on' : '')} onClick={helpful} disabled={p.mine} aria-pressed={p.voted}
          aria-label={t('gal.helpfulCount', { n: p.helpful })}>
          <Svg d={HEART} size={18} fill={p.voted} /> {t('gal.helpful')} · {num(p.helpful)}
        </button>
        <button type="button" className="btn gal-action" onClick={share}>{t('gal.share')}</button>
      </div>
      {note && <p className="gal-note" role="status">{note}</p>}

      {around.length > 0 && (
        <section aria-labelledby="gal-around">
          <h2 id="gal-around" className="gal-h2">{t('gal.around')}</h2>
          <div className="gal-thumbs">
            {around.map(x => (
              <Link key={x.id} href={`/gallery/photo?id=${x.id}`} onClick={() => setId(x.id)} className="gal-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element -- public storage file */}
                <img src={fileUrl(x.thumb_path)} alt={x.caption || t('gal.photoAlt', { place: x.place ?? '' })} loading="lazy" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="gal-foot-actions">
        {p.mine
          ? <button type="button" className="btn gal-link" onClick={() => setSheet('remove')}>{t('gal.remove')}</button>
          : <>
              <button type="button" className="btn gal-link" onClick={() => (user ? setSheet('report') : go('signin'))}>{t('gal.report')}</button>
              {user && <button type="button" className="btn gal-link" onClick={() => setSheet('block')}>{t('gal.block', { handle: p.handle })}</button>}
            </>}
        {admin && <button type="button" className="btn gal-link" onClick={feature}>{t(p.featured ? 'gal.unfeature' : 'gal.feature')}</button>}
        {admin && <Link className="gal-link" href="/gallery/moderate">{t('mod.title')}</Link>}
      </div>

      {sheet === 'report' && (
        <BottomSheet title={t('gal.reportTitle')} onClose={() => setSheet(null)}>
          <p className="you-sheet-text">{t('gal.reportText')}</p>
          {REASONS.map(r => (
            <button key={r} type="button" className="btn you-row" onClick={async () => {
              const ok = await reportPhoto(p.id, r);
              setSheet(null);
              setNote(t(ok ? 'gal.reported' : 'gal.actionFailed'));
            }}>{t(`gal.reason.${r}` as MessageKey)}</button>
          ))}
        </BottomSheet>
      )}
      {sheet === 'block' && (
        <BottomSheet title={t('gal.blockTitle', { handle: p.handle })} onClose={() => setSheet(null)}>
          <p className="you-sheet-text">{t('gal.blockText')}</p>
          <button type="button" className="btn pill pill-primary sheet-pill" onClick={async () => {
            if (await blockOwner(p.id)) go('gallery'); else { setSheet(null); setNote(t('gal.actionFailed')); }
          }}>{t('gal.blockConfirm')}</button>
        </BottomSheet>
      )}
      {sheet === 'remove' && (
        <BottomSheet title={t('gal.removeTitle')} onClose={() => setSheet(null)}>
          <p className="you-sheet-text">{t('gal.removeText')}</p>
          <button type="button" className="btn pill pill-primary sheet-pill danger" onClick={async () => {
            if (await removePhoto(p.id)) go('gallery'); else { setSheet(null); setNote(t('gal.actionFailed')); }
          }}>{t('gal.removeConfirm')}</button>
        </BottomSheet>
      )}
    </main>
  );
}
