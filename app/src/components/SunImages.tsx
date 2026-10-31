'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SDO_IMAGES, sdoAt } from '../lib/sdo';
import { useI18n } from '../i18n/I18n';

// The visible-light (HMI) view is the labelled disc in SunspotRegions.
const IMAGES = SDO_IMAGES.filter(img => img.id !== 'HMIIC');

/** Wide screens with a mouse open an image in the lightbox; phones keep the plain grid. */
const DESKTOP = '(min-width: 900px) and (hover: hover)';
const subscribe = (on: () => void) => { const mq = window.matchMedia(DESKTOP); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); };
const useDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false);

/** The latest SDO, SOHO and NOAA images: one column on phones, two on laptops, with a lightbox on desktop. */
export function SunImages() {
  const { t } = useI18n();
  const desktop = useDesktop();
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  const step = (by: number) => setOpen(i => (i === null ? i : (i + by + IMAGES.length) % IMAGES.length));
  const shown = open === null ? null : IMAGES[open];

  return (
    <>
      <div className="sun-grid">
        {IMAGES.map((img, i) => {
          const pic = (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={img.url} srcSet={img.sized ? `${img.url} 512w, ${sdoAt(img, 1024)} 1024w` : undefined} sizes="(min-width: 900px) 50vw, 100vw"
              alt={t('home.sun.alt', { band: img.label })} loading="lazy" width={512} height={512} />
          );
          return (
            <figure key={img.id} className="sun-fig">
              {desktop
                ? <button type="button" className="btn sun-zoom" onClick={() => setOpen(i)} aria-label={t('sun.enlarge', { band: img.label })}>{pic}</button>
                : pic}
              <figcaption>
                <span style={{ fontWeight: 700 }}>{img.label}</span><span style={{ color: 'var(--muted)' }}>{t(`sdo.${img.id}`)}</span>
              </figcaption>
            </figure>
          );
        })}
      </div>
      <dialog ref={dialog} className="sun-lightbox" aria-label={t('sun.viewer')} onClose={() => setOpen(null)}
        onClick={e => { if (e.target === e.currentTarget) setOpen(null); }}
        onKeyDown={e => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); }}>
        {shown && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sdoAt(shown, 2048)} alt={t('home.sun.alt', { band: shown.label })} width={1024} height={1024} />
            <figcaption>
              <span><b>{shown.label}</b> · {t(`sdo.${shown.id}`)}</span>
              <span style={{ color: 'var(--muted)' }}>{t(`sdo.${shown.id}.info`)}</span>
            </figcaption>
          </figure>
        )}
        <button type="button" className="btn sun-lb-btn sun-lb-close" onClick={() => setOpen(null)} aria-label={t('sky.close')}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
        <button type="button" className="btn sun-lb-btn sun-lb-prev" onClick={() => step(-1)} aria-label={t('sun.prev')}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="btn sun-lb-btn sun-lb-next" onClick={() => step(1)} aria-label={t('sun.next')}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </dialog>
    </>
  );
}
