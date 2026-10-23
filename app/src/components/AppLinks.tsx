'use client';

import { useEffect } from 'react';
import { nativePlugin } from '../lib/native';

type Listener = { remove: () => Promise<void> };
type AppPlugin = {
  getLaunchUrl: () => Promise<{ url?: string } | undefined>;
  addListener: (event: 'appUrlOpen', cb: (e: { url: string }) => void) => Promise<Listener> | Listener;
};

const HOSTS = ['www.polarlights.io', 'polarlights.io'];
const SEEN = 'polarlights.launchUrl';

/**
 * The Android app's links: a polarlights.io link opened from email, chat or the browser (Android App Links,
 * see AndroidManifest.xml and /.well-known/assetlinks.json) starts the app on the home page; this opens the
 * page the link points to. Does nothing on the website.
 */
export function AppLinks() {
  useEffect(() => {
    const app = nativePlugin<AppPlugin>('App');
    if (!app) return;
    const open = (url: string | undefined) => {
      if (!url) return;
      let to: URL;
      try { to = new URL(url); } catch { return; }
      if (to.protocol !== 'https:' || !HOSTS.includes(to.hostname)) return;
      const path = to.pathname + to.search + to.hash;
      if (path !== window.location.pathname + window.location.search + window.location.hash) window.location.assign(path);
    };
    // The link that started the app: followed once, so a later full page load doesn't jump back to it.
    void app.getLaunchUrl().then(r => {
      try {
        if (!r?.url || sessionStorage.getItem(SEEN) === r.url) return;
        sessionStorage.setItem(SEEN, r.url);
      } catch { /* storage unavailable: follow it anyway */ }
      open(r?.url);
    }).catch(() => {});
    // Links opened while the app is running.
    const sub = app.addListener('appUrlOpen', e => open(e.url));
    return () => { Promise.resolve(sub).then(l => l.remove()).catch(() => {}); };
  }, []);
  return null;
}
