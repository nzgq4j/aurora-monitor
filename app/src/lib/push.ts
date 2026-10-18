'use client';

import { supabase } from './supabase';

/**
 * Web push on the client: whether this browser can take push alerts, and subscribing or unsubscribing
 * it for the signed-in user (rows in push_subscriptions, read by the alert engine).
 */

export const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** Running as an installed app (home screen), where iPhone allows web push. */
export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);

export type PushState = 'unconfigured' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

const urlB64 = (b64: string) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};

export async function pushState(): Promise<PushState> {
  if (!VAPID_PUBLIC) return 'unconfigured';
  if (typeof window === 'undefined') return 'unsupported';
  // iPhone and iPad only offer push to sites added to the home screen.
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Ask for permission (must follow a tap), subscribe this browser and store it for the user. */
export async function enablePush(): Promise<PushState> {
  const sb = supabase();
  const state = await pushState();
  if (!sb || state === 'unconfigured' || state === 'unsupported' || state === 'needs-install' || state === 'denied') return state;
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(VAPID_PUBLIC) });
  const j = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' },
  );
  if (error) { await sub.unsubscribe(); throw error; }
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase()?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  return pushState();
}
