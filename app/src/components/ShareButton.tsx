'use client';

import { useEffect, useRef, useState } from 'react';
import { shareOut } from '../lib/share';
import { useI18n } from '../i18n/I18n';

/**
 * A card's share button: shares the card as a picture with its post and link. The picture is drawn
 * ahead of time (`draw`, again whenever `stamp` changes) because Safari only opens the share sheet
 * straight from a tap; until it's ready, or if it can't be drawn, the post and link go on their own.
 */
export function ShareButton({ label, name, draw, text, url, stamp }: {
  label: string; name: string; draw: () => Promise<Blob | null>; text: string; url: string; stamp: string;
}) {
  const { t } = useI18n();
  const file = useRef<File | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    file.current = null;
    let live = true;
    // After the page has settled, so drawing doesn't hold up the first paint.
    const id = setTimeout(() => {
      draw().then(blob => { if (live && blob) file.current = new File([blob], name, { type: blob.type || 'image/png' }); }).catch(() => { /* the post and link still share */ });
    }, 600);
    return () => { live = false; clearTimeout(id); };
  }, [stamp]); // eslint-disable-line react-hooks/exhaustive-deps -- `stamp` stands for everything the picture shows

  const share = async () => {
    setMsg('');
    const r = await shareOut(file.current, text, url);
    if (r === 'copied') setMsg(t('tonight.copied'));
    else if (r === 'failed') setMsg(t('tonight.shareFailed'));
  };
  return (
    <span className="share-aside">
      <button type="button" className="btn info-btn" onClick={share} aria-label={label} title={label}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {msg && <span role="status" className="share-msg">{msg}</span>}
    </span>
  );
}
