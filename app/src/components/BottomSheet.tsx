'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** How far (px) a downward swipe must go, or how fast (px/ms), to close the sheet. */
const CLOSE_DISTANCE = 90;
const CLOSE_SPEED = 0.5;

/**
 * A panel that slides up from the bottom. It closes on a tap outside it, a swipe down (from anywhere on
 * it while its content is scrolled to the top), Escape, or its own buttons; choices in it apply as
 * they're made, so closing keeps them. Rendered at the end of <body>, so a clipped or positioned parent
 * (the map's panel) can't hide it.
 */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ y: number; t: number; dy: number; active: boolean } | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  useEffect(() => { panel.current?.focus(); }, []);

  // Swipe down to close. Touch listeners are added by hand so a downward drag can stop the page scrolling.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const down = (e: TouchEvent) => {
      drag.current = el.scrollTop <= 0 && e.touches.length === 1 ? { y: e.touches[0].clientY, t: e.timeStamp, dy: 0, active: false } : null;
    };
    const move = (e: TouchEvent) => {
      const d = drag.current;
      if (!d) return;
      const dy = e.touches[0].clientY - d.y;
      // Upward or barely moving: leave it to scrolling and taps.
      if (!d.active && (dy < 6 || el.scrollTop > 0)) { if (dy < 0) drag.current = null; return; }
      d.active = true;
      d.dy = Math.max(0, dy);
      e.preventDefault();
      setOffset(d.dy);
    };
    const up = (e: TouchEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d?.active) return;
      const speed = d.dy / Math.max(1, e.timeStamp - d.t);
      if (d.dy > CLOSE_DISTANCE || speed > CLOSE_SPEED) { setClosing(true); setTimeout(onClose, 180); }
      else setOffset(0);
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
    return () => {
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', up);
      el.removeEventListener('touchcancel', up);
    };
  }, [onClose]);

  const dragging = offset > 0 && !closing && drag.current?.active;
  return createPortal(
    <div className="you-sheet-wrap">
      {/* Closes when the finger lifts as well as on click, so a tap outside always closes it. */}
      <button type="button" className="btn you-sheet-backdrop" aria-label={title} tabIndex={-1} onClick={onClose}
        onPointerUp={e => { if (e.pointerType !== 'mouse') onClose(); }}
        style={{ opacity: closing ? 0 : 1 - Math.min(0.6, offset / 500) }} />
      <div ref={panel} className={'you-sheet' + (dragging ? ' dragging' : '')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        style={{ transform: closing ? 'translateY(100%)' : offset ? `translateY(${offset}px)` : undefined }}>
        <span className="you-sheet-handle" aria-hidden="true" />
        <h2 className="you-sheet-title">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
