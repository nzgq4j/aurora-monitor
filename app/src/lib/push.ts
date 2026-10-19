'use client';

import { supabase } from './supabase';
import { inApp, nativePlugin } from './native';

/**
 * Web push on the client: whether this browser can take push alerts, and subscribing or unsubscribing
 * it for the signed-in user (rows in push_subscriptions, read by the alert engine).
 */

export const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** Running as an installed app (home screen), where iPhone allows web push. */
export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);

export type PushState = 'unconfigured' | 'unsupported' | 'app' | 'needs-install' | 'denied' | 'off' | 'on';

/**
 * The Android app's notifications (Firebase, through @capacitor/push-notifications). Switched on with
 * NEXT_PUBLIC_APP_PUSH=1 once the app has its Firebase configuration (google-services.json): asking
 * Firebase for a token without it would fail.
 */
const APP_PUSH = process.env.NEXT_PUBLIC_APP_PUSH === '1';
/** This install's Firebase token, kept on the device so the switch knows it's on. */
const FCM_KEY = 'pl.fcmToken';
type Listener = { remove: () => Promise<void> };
type PushNotifications = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  unregister: () => Promise<void>;
  createChannel: (c: { id: string; name: string; importance: number; visibility?: number; vibration?: boolean; lights?: boolean; lightColor?: string }) => Promise<void>;
  addListener: (event: string, cb: (x: { value?: string; error?: string; notification?: { data?: Record<string, string> } }) => void) => Promise<Listener>;
};
export const appPush = () => (APP_PUSH ? nativePlugin<PushNotifications>('PushNotifications') : null);
const readToken = () => { try { return localStorage.getItem(FCM_KEY); } catch { return null; } };
const writeToken = (t: string | null) => { try { if (t) localStorage.setItem(FCM_KEY, t); else localStorage.removeItem(FCM_KEY); } catch { /* storage unavailable */ } };

/** Register with Firebase and wait for this install's token. */
function fcmToken(pn: PushNotifications): Promise<string> {
  return new Promise((resolve, reject) => {
    const subs: Promise<Listener>[] = [];
    const done = () => subs.forEach(l => l.then(x => x.remove()).catch(() => {}));
    const timer = setTimeout(() => { done(); reject(new Error('timeout')); }, 20_000);
    subs.push(pn.addListener('registration', t => { clearTimeout(timer); done(); resolve(t.value ?? ''); }));
    subs.push(pn.addListener('registrationError', e => { clearTimeout(timer); done(); reject(new Error(e.error ?? 'registration')); }));
    pn.register().catch(e => { clearTimeout(timer); done(); reject(e); });
  });
}

/** Store (or move) this install's token for the signed-in user. */
async function saveToken(token: string, previous: string | null) {
  const sb = supabase();
  if (!sb) return;
  if (previous && previous !== token) await sb.from('push_subscriptions').delete().eq('endpoint', `fcm:${previous}`);
  const { error } = await sb.from('push_subscriptions').upsert(
    { endpoint: `fcm:${token}`, p256dh: '', auth: '', kind: 'fcm', user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
  writeToken(token);
}

/**
 * When the app starts with notifications on: refresh this install's token (Firebase can replace it).
 * Returns false when there was nothing to do.
 */
export async function refreshAppPush(): Promise<boolean> {
  const pn = appPush(), previous = readToken();
  if (!pn || !previous) return false;
  if ((await pn.checkPermissions()).receive !== 'granted') return false;
  const token = await fcmToken(pn);
  if (token && token !== previous) await saveToken(token, previous);
  return true;
}

const urlB64 = (b64: string) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  // The Android app's web view has no web push; the app has its own (Firebase) notifications.
  if (inApp()) {
    const pn = appPush();
    if (!pn) return 'app';
    if ((await pn.checkPermissions()).receive === 'denied') return 'denied';
    return readToken() ? 'on' : 'off';
  }
  if (!VAPID_PUBLIC) return 'unconfigured';
  // iPhone and iPad only offer push to sites added to the home screen.
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Ask for permission (must follow a tap), subscribe this browser and store it for the user. */
export async function enablePush(channelName = 'Aurora alerts'): Promise<PushState> {
  const sb = supabase();
  const pn = appPush();
  if (pn) {
    let perm = await pn.checkPermissions();
    if (perm.receive.startsWith('prompt')) perm = await pn.requestPermissions();
    if (perm.receive !== 'granted') return 'denied';
    // High importance, so alerts make a sound and show on screen.
    await pn.createChannel({ id: 'aurora', name: channelName, importance: 4, visibility: 1, vibration: true, lights: true, lightColor: '#6CFF2B' }).catch(() => {});
    await saveToken(await fcmToken(pn), readToken());
    return 'on';
  }
  const state = await pushState();
  if (!sb || state === 'unconfigured' || state === 'unsupported' || state === 'app' || state === 'needs-install' || state === 'denied') return state;
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
  const pn = appPush();
  if (pn) {
    const token = readToken();
    if (token) await supabase()?.from('push_subscriptions').delete().eq('endpoint', `fcm:${token}`);
    await pn.unregister().catch(() => {});
    writeToken(null);
    return pushState();
  }
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase()?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  return pushState();
}
