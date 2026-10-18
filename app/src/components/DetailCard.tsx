'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';

const KEY = 'pl.cards';
const read = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };

/**
 * A Now-page section that folds to its title and a one-line summary (#65). Phones start folded,
 * larger screens open; once someone opens or closes a card, this device remembers it. The open
 * state is set through data-open ('auto' until chosen), so the server render needs no guess
 * about the screen and nothing flashes.
 */
export function DetailCard({ id, title, summary, aside, children }: { id: string; title: ReactNode; summary: ReactNode; aside?: ReactNode; children: ReactNode }) {
  const body = useId();
  const [open, setOpen] = useState<boolean | null>(null);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const saved = read()[id];
    if (typeof saved === 'boolean') setOpen(saved);
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [id]);
  const shown = open ?? !phone;
  const toggle = () => {
    const next = !shown;
    setOpen(next);
    try { localStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: next })); } catch { /* storage unavailable */ }
  };
  return (
    <section className="detail-card rule-top" data-open={open === null ? 'auto' : String(open)}>
      <div className="detail-head">
        <h2 className="detail-title">
          <button type="button" className="btn detail-toggle" aria-expanded={shown} aria-controls={body} onClick={toggle}>
            <span className="display" style={{ fontSize: 'var(--h-section)', lineHeight: 1 }}>{title}</span>
            <span className="detail-summary">{summary}</span>
            <svg className="detail-chevron" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </h2>
        {aside && <div className="detail-aside">{aside}</div>}
      </div>
      <div id={body} className="detail-body">{children}</div>
    </section>
  );
}
