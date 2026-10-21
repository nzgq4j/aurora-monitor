import { googleAccessToken, resetGoogleTokens, serviceAccount, type ServiceAccount } from './googleAuth';

/**
 * Push alerts to the Android app through Firebase Cloud Messaging (HTTP v1). Signs in as the Firebase
 * service account in FCM_SERVICE_ACCOUNT (its JSON key, a Vercel secret) with a self-signed JWT, and
 * keeps the access token until shortly before it expires.
 */

export interface FcmMessage { title: string; body: string; url: string; tag: string }
/** 'sent', 'gone' (the token is no longer valid: remove it) or a short failure description. */
export type FcmResult = 'sent' | 'gone' | string;

let account: ServiceAccount | null | undefined;

/** The service account, or null when FCM_SERVICE_ACCOUNT isn't set (or isn't valid JSON). */
export function fcmAccount(): ServiceAccount | null {
  if (account === undefined) account = serviceAccount('FCM_SERVICE_ACCOUNT');
  return account;
}

const accessToken = (a: ServiceAccount) => googleAccessToken(a, 'https://www.googleapis.com/auth/firebase.messaging');

/** Send one notification to one app install. Shown in the "aurora" channel with the app's alert icon. */
export async function sendFcm(token: string, m: FcmMessage): Promise<FcmResult> {
  const a = fcmAccount();
  if (!a) return 'not_configured';
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken(a)}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: m.title, body: m.body },
        data: { url: m.url, tag: m.tag },
        android: { priority: 'HIGH', ttl: '3600s', notification: { channel_id: 'aurora', tag: m.tag, icon: 'ic_stat_aurora', color: '#6CFF2B' } },
      },
    }),
  });
  if (res.ok) return 'sent';
  const err = await res.json().catch(() => null) as { error?: { status?: string; details?: { errorCode?: string }[] } } | null;
  const code = err?.error?.details?.find(d => d.errorCode)?.errorCode ?? err?.error?.status;
  // The app was uninstalled or its registration replaced.
  if (res.status === 404 || code === 'UNREGISTERED') return 'gone';
  return `failed: ${res.status}${code ? ` ${code}` : ''}`;
}

/** Test hook: forget the cached account and token. */
export function resetFcm() { account = undefined; resetGoogleTokens(); }
