import { createSign } from 'crypto';

/**
 * Google OAuth access tokens for a service account (its JSON key, kept in a Vercel secret), from a
 * self-signed JWT. Tokens are cached per account and scope until shortly before they expire.
 */

export interface ServiceAccount { project_id: string; client_email: string; private_key: string }

/** The service account in env var `name`, or null when it isn't set (or isn't valid JSON). */
export function serviceAccount(name: string): ServiceAccount | null {
  try {
    const a = JSON.parse(process.env[name] ?? '') as ServiceAccount;
    return a.project_id && a.client_email && a.private_key ? a : null;
  } catch {
    return null;
  }
}

const b64url = (x: string | Buffer) => Buffer.from(x).toString('base64url');
const cache = new Map<string, { token: string; until: number }>();

export async function googleAccessToken(a: ServiceAccount, scope: string, now = Date.now()): Promise<string> {
  const key = `${a.client_email} ${scope}`;
  const hit = cache.get(key);
  if (hit && hit.until > now + 60_000) return hit.token;
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: a.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
  const signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(a.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    // A slow service never holds up the alert run.
    signal: AbortSignal.timeout(10000),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${signature}` }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const j = await res.json() as { access_token: string; expires_in: number };
  cache.set(key, { token: j.access_token, until: now + j.expires_in * 1000 });
  return j.access_token;
}

/** Test hook: forget cached tokens. */
export function resetGoogleTokens() { cache.clear(); }
