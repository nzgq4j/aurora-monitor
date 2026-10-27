'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { badges, specialBadges, type Badge } from '../lib/badges';
import { myAchievements, myMember, mySpecialBadges } from '../lib/community';
import { useI18n } from '../i18n/I18n';
import { BadgeSheet } from '../screens/Badges';

const KEY = 'pl-badges-seen';

/** Records a badge as already shown (a redeemed code opens its own sheet), so it doesn't pop up again. */
export function markSeen(userId: string, b: Badge) {
  try {
    const seen = JSON.parse(localStorage.getItem(`${KEY}:${userId}`) ?? 'null') as Record<string, number> | null;
    if (seen) localStorage.setItem(`${KEY}:${userId}`, JSON.stringify({ ...seen, [b.id]: b.level }));
  } catch { /* unavailable */ }
}

/**
 * Shows a "New badge" sheet when a badge or tier is earned (badges are awarded by the database, every
 * 15 minutes for reports). Checked when the app opens and when it comes back to the front. What has been
 * shown is remembered on this device; the first check only records what's already earned.
 */
export function BadgeWatcher() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const [queue, setQueue] = useState<Badge[]>([]);

  useEffect(() => {
    if (!user) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const [m, a, sp] = await Promise.all([myMember(), myAchievements(), mySpecialBadges()]);
        if (!m) return;
        const now = [...badges(a, m), ...specialBadges(sp, locale)].filter(b => b.level);
        let seen: Record<string, number> | null = null;
        try { seen = JSON.parse(localStorage.getItem(`${KEY}:${user.id}`) ?? 'null'); } catch { /* unavailable */ }
        const fresh = seen ? now.filter(b => (seen![b.id] ?? 0) < b.level) : [];
        try { localStorage.setItem(`${KEY}:${user.id}`, JSON.stringify(Object.fromEntries(now.map(b => [b.id, b.level])))); } catch { /* unavailable */ }
        if (fresh.length) setQueue(q => [...q, ...fresh]);
      } finally {
        busy = false;
      }
    };
    void check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [user, locale]);

  if (!queue.length) return null;
  return <BadgeSheet key={queue[0].id} b={queue[0]} fresh onClose={() => setQueue(q => q.slice(1))} />;
}
