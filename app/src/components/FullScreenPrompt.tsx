'use client';

import { useEffect, useState } from 'react';
import { SITE } from '../lib/site';

/** Chrome's install event (not in the DOM typings). */
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const KEY = 'pl.fullscreen.dismissed';
const SNOOZE = 14 * 864e5;

/**
 * Websites can't hide the browser's own bars, so on phones this offers the two ways to get Polar Lights
 * full screen: install it (opens standalone, no browser frame) or, where the browser allows it
 * (Android Chrome), switch to full screen now. iPhone browsers get Add to Home Screen steps instead.
 */
export function FullScreenPrompt() {
  const [show, setShow] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [canFull, setCanFull] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const phone = matchMedia('(pointer: coarse)').matches && innerWidth <= 900;
    let snoozed = false;
    try { snoozed = Date.now() - Number(localStorage.getItem(KEY) || 0) < SNOOZE; } catch { /* storage blocked */ }
    if (standalone || !phone || snoozed) return;
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIos(isIos);
    setCanFull(!isIos && !!document.documentElement.requestFullscreen && document.fullscreenEnabled);
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    addEventListener('beforeinstallprompt', onPrompt);
    const t = setTimeout(() => setShow(true), 1500);
    return () => { removeEventListener('beforeinstallprompt', onPrompt); clearTimeout(t); };
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  };
  const doInstall = async () => {
    if (!install) return;
    await install.prompt();
    const { outcome } = await install.userChoice;
    setInstall(null);
    if (outcome === 'accepted') setShow(false);
  };
  const goFull = async () => {
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); setShow(false); } catch { setCanFull(false); }
  };

  if (!show || (!install && !canFull && !ios)) return null;
  return (
    <div role="dialog" aria-label={`Use ${SITE.name} full screen`} className="fs-prompt">
      <img src="/icons/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 10, flex: 'none' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Use {SITE.name} full screen</span>
        {ios ? (
          <span style={{ fontSize: 13, color: 'var(--soft)', lineHeight: 1.4 }}>
            Tap <ShareIcon /> <b>Share</b> (or the <b>⋯</b> menu), then <b>Add to Home Screen</b>. Open it from your home screen for no browser bars.
          </span>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--soft)', lineHeight: 1.4 }}>
            {install ? 'Install the app to open it full screen, without the browser bar.' : 'Hide the browser bar while you watch the sky.'}
          </span>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {install && <button type="button" className="btn pill pill-primary" onClick={doInstall} style={{ fontSize: 14, padding: '9px 16px' }}>Install app</button>}
          {canFull && <button type="button" className={'btn pill ' + (install ? 'pill-ghost' : 'pill-primary')} onClick={goFull} style={{ fontSize: 14, padding: '9px 16px' }}>Full screen</button>}
          <button type="button" className="btn" onClick={dismiss} style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', padding: '9px 6px' }}>Not now</button>
        </div>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
      <path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
