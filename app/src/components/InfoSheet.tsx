'use client';

import { useCallback, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { useI18n } from '../i18n/I18n';

/** A row of a metric's scale: a coloured dot, a value or range ("600+ km/s") and what it means. */
export interface InfoScale { color: string; value: string; label: string }
/** One measure explained in a card's info sheet; `image` is a small sample of it (e.g. that view of the Sun). */
export interface InfoMetric { name: string; text?: string; badge?: string; scale?: InfoScale[]; image?: string }
/** What a card's info sheet says: a question-style heading, a one-line lead, why it matters, and its measures. */
export interface InfoContent { heading: string; lead: string; why?: string[]; metrics?: InfoMetric[]; note?: string }

const WHY_ICON = 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z';

/**
 * The "i" in a card's corner: opens one sheet that explains the whole card, laid out as a heading and
 * lead, then why it matters and the key measures with their scales. Replaces the per-item
 * "What this shows" toggles.
 */
export function InfoButton({ title, content }: { title: string; content: InfoContent }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className="btn info-btn" aria-haspopup="dialog" aria-label={t('info.open', { title })} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 11v6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="12" cy="7.6" r="1.2" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <BottomSheet title={title} onClose={close}>
          <InfoBody content={content} />
        </BottomSheet>
      )}
    </>
  );
}

function InfoBody({ content: c }: { content: InfoContent }) {
  const { t } = useI18n();
  return (
    <div className="info-sheet">
      <div className="info-intro">
        <h3>{c.heading}</h3>
        <p>{c.lead}</p>
      </div>
      {!!c.why?.length && (
        <section className="info-section">
          <h4>{t('info.why')}</h4>
          <ul className="info-why">
            {c.why.map(w => (
              <li key={w}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d={WHY_ICON} fill="currentColor" /></svg><span>{w}</span></li>
            ))}
          </ul>
        </section>
      )}
      {!!c.metrics?.length && (
        <section className="info-section">
          <h4>{t('info.metrics')}</h4>
          <div className="info-metrics">
            {c.metrics.map(m => (
              <div key={m.name} className="info-metric">
                <div className="info-metric-head">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the same live image the page shows, from its publisher */}
                  {m.image && <img className="info-thumb" src={m.image} alt="" width={64} height={64} loading="lazy" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />}
                  <b>{m.name}</b>{m.badge && <span className="info-badge">{m.badge}</span>}
                </div>
                {m.text && <p>{m.text}</p>}
                {!!m.scale?.length && (
                  <dl className="info-scale">
                    {m.scale.map(s => (
                      <div key={s.value}>
                        <dt><i style={{ background: s.color }} aria-hidden="true" /><span className="mono">{s.value}</span></dt>
                        <dd>{s.label}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {c.note && <p className="info-note">{c.note}</p>}
    </div>
  );
}
