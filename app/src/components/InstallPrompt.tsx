'use client';

import { useEffect, useRef, useState } from 'react';
import { isIos, isStandalone } from '../lib/push';
import { useI18n } from '../i18n/I18n';

/** Fired when a moment shows the app is worth keeping (e.g. the verdict is Possible or better). */
export const USEFUL_EVENT = 'pl:useful';
/** Fired to open the prompt straight away (e.g. switching on push on an iPhone that hasn't installed). */
export const INSTALL_EVENT = 'pl:install';

const DISMISS_KEY = 'pl.install.dismissed', VISITS_KEY = 'pl.visits', SEEN_KEY = 'pl.install.seen';
const QUIET_DAYS = 14;

interface BeforeInstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const read = (k: string, store: Storage = localStorage) => { try { return store.getItem(k); } catch { return null; } };
const write = (k: string, v: string, store: Storage = localStorage) => { try { store.setItem(k, v); } catch { /* storage unavailable */ } };

/**
 * Asks visitors to add Polar Lights to their home screen, but only after a useful moment (a promising
 * verdict, or a second visit), never once installed, and not again for 14 days after "Not now".
 * iPhone gets Share → Add to Home Screen steps (Safari has no install prompt); Android and desktop
 * Chrome get the browser's own install dialog. Installing is what lets iPhones receive push alerts.
 */
export function InstallPrompt() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
  const deferred = useRef<BeforeInstallPrompt | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    setIos(isIos());
    // Count visits once per browser session.
    if (!read(SEEN_KEY, sessionStorage)) {
      write(SEEN_KEY, '1', sessionStorage);
      write(VISITS_KEY, String(Number(read(VISITS_KEY) ?? 0) + 1));
    }
    const installable = () => isIos() || !!deferred.current;
    const quiet = () => Date.now() - Number(read(DISMISS_KEY) ?? 0) < QUIET_DAYS * 864e5;
    // A useful moment can come before the browser offers install; remember it for when it does.
    let shown = false, useful = false, timer = 0;
    const maybe = (force = false) => {
      if (shown || !installable() || (!force && quiet())) return;
      shown = true;
      timer = window.setTimeout(() => setOpen(true), force ? 0 : 2500);
    };
    const onBip = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPrompt;
      if (useful || Number(read(VISITS_KEY) ?? 0) >= 2) maybe();
    };
    const onUseful = () => { useful = true; maybe(); };
    const onInstall = () => { shown = false; maybe(true); };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener(USEFUL_EVENT, onUseful);
    window.addEventListener(INSTALL_EVENT, onInstall);
    window.addEventListener('appinstalled', () => setOpen(false));
    if (isIos() && Number(read(VISITS_KEY) ?? 0) >= 2) maybe();
    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener(USEFUL_EVENT, onUseful);
      window.removeEventListener(INSTALL_EVENT, onInstall);
    };
  }, []);

  if (!open) return null;
  const later = () => { write(DISMISS_KEY, String(Date.now())); setOpen(false); };
  const install = async () => {
    const d = deferred.current;
    if (!d) return;
    await d.prompt();
    const { outcome } = await d.userChoice;
    deferred.current = null;
    if (outcome !== 'accepted') write(DISMISS_KEY, String(Date.now()));
    setOpen(false);
  };

  return (
    <div className="install-sheet" role="dialog" aria-labelledby="install-title" aria-describedby="install-body">
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={48} height={48} style={{ borderRadius: 12, flex: 'none' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <strong id="install-title" style={{ fontSize: 17 }}>{t('install.title')}</strong>
          <span id="install-body" style={{ fontSize: 14, color: 'var(--soft)' }}>{t('install.body')}</span>
        </div>
      </div>
      {ios && (
        <ol className="install-steps">
          <li>
            {t('install.ios.1')}
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </li>
          <li>{t('install.ios.2')}</li>
          <li>{t('install.ios.3')}</li>
        </ol>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn pill pill-ghost" onClick={later} style={{ fontSize: 15, padding: '11px 18px' }}>{t('install.later')}</button>
        {ios
          ? <button type="button" className="btn pill pill-primary" onClick={() => setOpen(false)} style={{ fontSize: 15, padding: '11px 20px' }}>{t('install.done')}</button>
          : <button type="button" className="btn pill pill-primary" onClick={install} style={{ fontSize: 15, padding: '11px 20px' }}>{t('install.button')}</button>}
      </div>
    </div>
  );
}
