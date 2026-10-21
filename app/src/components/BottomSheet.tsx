'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** A panel that slides up from the bottom; closes on the backdrop, Escape, or its own buttons. */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="you-sheet-wrap">
      <button type="button" className="btn you-sheet-backdrop" aria-label={title} tabIndex={-1} onClick={onClose} />
      <div ref={panel} className="you-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <span className="you-sheet-handle" aria-hidden="true" />
        <h2 className="you-sheet-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
