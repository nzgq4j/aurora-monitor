'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth';
import { playBilling, resendPlayPurchases } from '../lib/playBilling';

/**
 * In the Android app, once per session after sign-in: a Google Play purchase the server hasn't
 * confirmed yet is sent again (see resendPlayPurchases). Does nothing on the website.
 */
export function PlaySync() {
  const { user, profile, verifyPlay } = useAuth();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !profile || done.current === user.id || !playBilling()) return;
    done.current = user.id;
    resendPlayPurchases(user.id, profile.playPurchaseToken, verifyPlay).catch(() => { /* tried again next start */ });
  }, [user, profile, verifyPlay]);
  return null;
}
