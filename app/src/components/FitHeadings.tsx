'use client';

import { useEffect } from 'react';

/**
 * Shrinks any large display heading whose longest word is wider than its box (common in German,
 * Dutch and French at phone widths), so words are never cut off or broken mid-word.
 */
export function FitHeadings() {
  useEffect(() => {
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const el of document.querySelectorAll<HTMLElement>('.display')) {
          el.style.fontSize = '';
          if (!el.offsetParent || el.scrollWidth <= el.clientWidth + 1) continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          el.style.fontSize = `${Math.floor(size * (el.clientWidth / el.scrollWidth) * 0.98)}px`;
        }
      });
    };
    fit();
    document.fonts?.ready.then(fit);
    window.addEventListener('resize', fit);
    // Headings also appear without a page change (Dashboard tabs, sign-in modes).
    // Map tiles change constantly and hold no headings, so their changes are ignored.
    const mo = new MutationObserver(records => { if (records.some(r => !(r.target as Element).closest?.('.leaflet-container'))) fit(); });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', fit); mo.disconnect(); };
  }, []);
  return null;
}
