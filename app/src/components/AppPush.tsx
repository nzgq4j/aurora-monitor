'use client';

import { useEffect } from 'react';
import { appPush, refreshAppPush } from '../lib/push';

/**
 * The Android app's notifications: a tap on an alert opens the page it points to, and when the app
 * starts with notifications on, its Firebase token is refreshed. Does nothing on the website.
 */
export function AppPush() {
  useEffect(() => {
    const pn = appPush();
    if (!pn) return;
    const tap = pn.addListener('pushNotificationActionPerformed', a => {
      const url = a.notification?.data?.url;
      if (!url) return;
      // Only pages on this site.
      const to = new URL(url, window.location.href);
      if (to.origin === window.location.origin) window.location.assign(to.pathname + to.search + to.hash);
    });
    refreshAppPush().catch(() => { /* kept as it is; the switch still shows it */ });
    return () => { Promise.resolve(tap).then(l => l.remove()).catch(() => {}); };
  }, []);
  return null;
}
