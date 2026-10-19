import { createSign } from 'crypto';

/**
 * Push alerts to the Android app through Firebase Cloud Messaging (HTTP v1). Signs in as the Firebase
 * service account in FCM_SERVICE_ACCOUNT (its JSON key, a Vercel secret) with a self-signed JWT, and
 * keeps the access token until shortly before it expires.
 */

interface ServiceAccount { project_id: string; client_email: string; private_key: string }

export interface FcmMessage { title: string; body: string; url: string; tag: string }
/** 'sent', 'gone' (the token is no longer valid: remove it) or a short failure description. */
export type FcmResult = 'sent' | 'gone' | string;

let account: ServiceAccount | null | undefined;
let cached: { token: string; until: number } | null = null;

/** The service account, or null when FCM_SERVICE_ACCOUNT isn't set (or isn't valid JSON). */
export function fcmAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  try {
    const a = JSON.parse(process.env.FCM_SERVICE_ACCOUNT ?? '') as ServiceAccount;
    account = a.project_id && a.client_email && a.private_key ? a : null;
  } catch {
    account = null;
  }
  return account;
}

const b64url = (x: string | Buffer) => Buffer.from(x).toString('base64url');

/** A Google OAuth access token for FCM, from a JWT signed with the service account's key. */
async function accessToken(a: ServiceAccount, now = Date.now()): Promise<string> {
  if (cached && cached.until > now + 60_000) return cached.token;
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: a.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  }));
  const signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(a.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${signature}` }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const j = await res.json() as { access_token: string; expires_in: number };
  cached = { token: j.access_token, until: now + j.expires_in * 1000 };
  return j.access_token;
}

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
export function resetFcm() { account = undefined; cached = null; }
