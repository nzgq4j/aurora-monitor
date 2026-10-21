'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deletePhotos, exportPhotos, inApp, listPhotos, markExported, type ExportResult, type GalleryPhoto } from '../lib/gallery';
import { useI18n } from '../i18n/I18n';

const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const SAVE = 'M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19h14';
const SHARE = 'M12 15V4m-4 4 4-4 4 4M6 11v8h12v-8';
const POST = 'M12 16V5m-4 4 4-4 4 4M4 15v4h16v-4';
const TRASH = 'M5 7h14M10 7V5h4v2m-7 0 1 12h8l1-12';

/**
 * The sky view's gallery (#99), like a camera app's media library: every photo taken in Sky view is kept
 * here on the phone; from here they're saved to Photos, shared or deleted, one at a time or several.
 */
export function SkyGallery({ onClose }: { onClose: () => void }) {
  const { t, tn, date } = useI18n();
  const router = useRouter();
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState('');
  const swipe = useRef<number | null>(null);

  useEffect(() => { listPhotos().then(setPhotos).catch(() => setPhotos([])); }, []);

  // Object URLs for the grid and the open photo, released when they change.
  const thumbs = useMemo(() => new Map((photos ?? []).map(p => [p.id, URL.createObjectURL(p.thumb)])), [photos]);
  useEffect(() => () => thumbs.forEach(u => URL.revokeObjectURL(u)), [thumbs]);
  const current = open !== null ? photos?.[open] ?? null : null;
  const full = useMemo(() => (current ? URL.createObjectURL(current.photo) : null), [current]);
  useEffect(() => () => { if (full) URL.revokeObjectURL(full); }, [full]);

  const when = (x: number) => date(x, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const chosen = current ? [current] : (photos ?? []).filter(p => picked.has(p.id));

  const reset = () => { setConfirmDelete(false); setNote(''); };
  const exportChosen = async (how: 'save' | 'share') => {
    reset();
    const list = chosen;
    if (!list.length) return;
    const r: ExportResult = await exportPhotos(list, how);
    if (r === 'done' || r === 'downloaded' || r === 'album') {
      await markExported(list);
      setPhotos(ps => ps?.map(p => (list.some(l => l.id === p.id) ? { ...p, exported: true } : p)) ?? ps);
      setNote(r === 'downloaded' ? tn('gallery.downloaded', list.length) : r === 'album' ? tn('gallery.album', list.length) : '');
    } else if (r === 'tap') setNote(t('gallery.tapAgain'));
    else if (r === 'denied') setNote(t('gallery.denied'));
    else if (r === 'failed') setNote(t('gallery.failed'));
  };
  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    const ids = chosen.map(p => p.id);
    await deletePhotos(ids);
    const rest = (photos ?? []).filter(p => !ids.includes(p.id));
    setPhotos(rest);
    setPicked(new Set()); setConfirmDelete(false); setSelecting(false);
    if (open !== null) setOpen(rest.length ? Math.min(open, rest.length - 1) : null);
  };
  const step = (d: number) => { if (open === null || !photos) return; reset(); setOpen(Math.max(0, Math.min(photos.length - 1, open + d))); };
  const toggle = (id: string) => { reset(); setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  const actions = (
    <div className="gallery-actions">
      <button type="button" className="btn" onClick={() => exportChosen('save')} disabled={!chosen.length}><Icon d={SAVE} />{t('gallery.save')}</button>
      <button type="button" className="btn" onClick={() => exportChosen('share')} disabled={!chosen.length}><Icon d={SHARE} />{t('gallery.share')}</button>
      {/* One photo at a time to the community gallery, with where and how it was taken. */}
      {current && <button type="button" className="btn" onClick={() => router.push(`/gallery/post?local=${encodeURIComponent(current.id)}`)}><Icon d={POST} />{t('gallery.post')}</button>}
      <button type="button" className={`btn${confirmDelete ? ' gallery-danger' : ''}`} onClick={remove} disabled={!chosen.length}>
        <Icon d={TRASH} />{confirmDelete ? tn('gallery.deleteConfirm', chosen.length) : t('gallery.delete')}
      </button>
    </div>
  );

  if (current && full) {
    return (
      <div className="gallery gallery-viewer" role="dialog" aria-label={t('gallery.title')}>
        <div className="gallery-top">
          <button type="button" className="btn sky-round" onClick={() => { reset(); setOpen(null); }} aria-label={t('gallery.back')}><Icon d="M15 5l-7 7 7 7" /></button>
          <span className="gallery-title"><b>{when(current.taken)}</b><small className="mono">{open! + 1}/{photos!.length}</small></span>
          <span className="gallery-badge">{current.exported ? t('gallery.saved') : ''}</span>
        </div>
        <div className="gallery-stage"
          onPointerDown={e => { swipe.current = e.clientX; }}
          onPointerUp={e => { if (swipe.current !== null && Math.abs(e.clientX - swipe.current) > 50) step(e.clientX < swipe.current ? 1 : -1); swipe.current = null; }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={full} alt={t('gallery.photoAlt', { time: when(current.taken) })} draggable={false} />
          {open! > 0 && <button type="button" className="btn gallery-nav gallery-prev" onClick={() => step(-1)} aria-label={t('gallery.prev')}><Icon d="M15 5l-7 7 7 7" /></button>}
          {open! < photos!.length - 1 && <button type="button" className="btn gallery-nav gallery-next" onClick={() => step(1)} aria-label={t('gallery.next')}><Icon d="M9 5l7 7-7 7" /></button>}
        </div>
        <div className="gallery-bottom">
          {actions}
          <p className="sky-small" role="status">{note}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gallery" role="dialog" aria-label={t('gallery.title')}>
      <div className="gallery-top">
        <button type="button" className="btn sky-round" onClick={onClose} aria-label={t('sky.close')}>×</button>
        <span className="gallery-title">
          <b>{t('gallery.title')}</b>
          {photos && <small>{selecting ? tn('gallery.selected', picked.size) : tn('gallery.count', photos.length)}</small>}
        </span>
        {!!photos?.length && (
          <button type="button" className="btn gallery-select" onClick={() => { reset(); setSelecting(!selecting); setPicked(new Set()); }}>
            {selecting ? t('gallery.cancel') : t('gallery.select')}
          </button>
        )}
      </div>
      {photos && !photos.length && <p className="gallery-empty">{t('gallery.empty')}</p>}
      {!!photos?.length && (
        <ul className="gallery-grid">
          {photos.map((p, i) => (
            <li key={p.id}>
              <button type="button" className="btn" aria-pressed={selecting ? picked.has(p.id) : undefined}
                aria-label={t('gallery.photoAlt', { time: when(p.taken) })}
                onClick={() => (selecting ? toggle(p.id) : (reset(), setOpen(i)))}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbs.get(p.id)} alt="" loading="lazy" />
                {selecting && <span className="gallery-tick" aria-hidden="true">{picked.has(p.id) ? '✓' : ''}</span>}
                {!selecting && p.exported && <span className="gallery-done" aria-label={t('gallery.saved')}><Icon d="m6 12.5 4 4 8-9" size={14} /></span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="gallery-bottom">
        {selecting && actions}
        <p className="sky-small" role="status">{note || t(inApp() ? 'gallery.noteApp' : 'gallery.note')}</p>
      </div>
    </div>
  );
}
