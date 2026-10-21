import 'server-only';
import { googleAccessToken, serviceAccount, type ServiceAccount } from './googleAuth';
import { supabaseAdmin } from './billing';

/**
 * Google Play subscriptions for the Android app. The app buys through Play Billing and sends the
 * purchase token here; the Google Play Developer API (as the service account in PLAY_SERVICE_ACCOUNT,
 * a Vercel secret, granted access in Play Console) says what it is, and the profile mirrors it, as the
 * Stripe webhook does for Stripe. Play's real-time developer notifications keep it current.
 */

export const PLAY_PACKAGE = 'io.polarlights.app';
/** The Play subscription product and its base plans (set up in Play Console). */
export const PLAY_PRODUCT = 'chaser';
export const PLAY_BASE_PLANS = { monthly: 'monthly', annual: 'annual' } as const;

const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/purchases`;
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

let account: ServiceAccount | null | undefined;
export function playAccount(): ServiceAccount | null {
  if (account === undefined) account = serviceAccount('PLAY_SERVICE_ACCOUNT');
  return account;
}

/** The parts of a SubscriptionPurchaseV2 this uses. */
export interface PlaySubscription {
  subscriptionState: string;
  acknowledgementState?: string;
  startTime?: string;
  linkedPurchaseToken?: string;
  testPurchase?: object;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: {
    productId: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerDetails?: { basePlanId?: string; offerId?: string };
    offerPhase?: { freeTrial?: object };
  }[];
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const a = playAccount();
  if (!a) throw new Error('not_configured');
  return fetch(`${API}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await googleAccessToken(a, SCOPE)}`, 'content-type': 'application/json', ...init?.headers },
  });
}

/** The subscription a purchase token belongs to, or null if Google doesn't know the token. */
export async function getPlaySubscription(token: string): Promise<PlaySubscription | null> {
  const res = await call(`subscriptionsv2/tokens/${encodeURIComponent(token)}`);
  if (res.status === 404 || res.status === 410 || res.status === 400) return null;
  if (!res.ok) throw new Error(`play get ${res.status}`);
  return res.json() as Promise<PlaySubscription>;
}

/** Confirm a purchase to Google; unacknowledged purchases are refunded after three days. */
export async function acknowledgePlay(productId: string, token: string): Promise<void> {
  const res = await call(`subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`, { method: 'POST', body: '{}' });
  if (!res.ok) throw new Error(`play acknowledge ${res.status}`);
}

/** Stop renewal (the user keeps what they've paid for). Used when the account is deleted. */
export async function cancelPlay(productId: string, token: string): Promise<void> {
  const res = await call(`subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:cancel`, { method: 'POST', body: '{}' });
  if (!res.ok) throw new Error(`play cancel ${res.status}`);
}

/**
 * A Play subscription in the profile's (Stripe-style) terms. CANCELED means renewal is off but the
 * paid time hasn't run out yet, so it stays active until expiry.
 */
export function playStatus(sub: PlaySubscription, now = Date.now()) {
  const item = sub.lineItems?.find(l => l.productId === PLAY_PRODUCT) ?? sub.lineItems?.[0];
  const expiry = item?.expiryTime ? Date.parse(item.expiryTime) : null;
  const live = expiry !== null && expiry > now;
  const trial = !!item?.offerPhase?.freeTrial;
  const status = ({
    SUBSCRIPTION_STATE_ACTIVE: trial ? 'trialing' : 'active',
    SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'past_due',
    SUBSCRIPTION_STATE_ON_HOLD: 'unpaid',
    SUBSCRIPTION_STATE_PAUSED: 'paused',
    SUBSCRIPTION_STATE_CANCELED: live ? (trial ? 'trialing' : 'active') : 'canceled',
    SUBSCRIPTION_STATE_EXPIRED: 'canceled',
    SUBSCRIPTION_STATE_PENDING: 'incomplete',
    SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'incomplete_expired',
  } as Record<string, string>)[sub.subscriptionState] ?? 'incomplete';
  return {
    status,
    paid: ['trialing', 'active', 'past_due'].includes(status),
    trial,
    expiry: expiry === null ? null : new Date(expiry).toISOString(),
    cancelAtPeriodEnd: sub.subscriptionState === 'SUBSCRIPTION_STATE_CANCELED' || item?.autoRenewingPlan?.autoRenewEnabled === false,
    cycle: item?.offerDetails?.basePlanId === PLAY_BASE_PLANS.monthly ? 'monthly' as const : 'annual' as const,
    productId: item?.productId ?? PLAY_PRODUCT,
  };
}

/**
 * Copy a Play subscription onto the user's profile. A Stripe subscription that is still paying is never
 * overwritten by an ended Play one (and the app won't sell Play to someone paying through Stripe).
 */
export async function syncPlay(userId: string, token: string, sub: PlaySubscription): Promise<ReturnType<typeof playStatus>> {
  const s = playStatus(sub);
  const db = supabaseAdmin();
  const { data: p, error } = await db.from('profiles').select('billing_source, subscription_status, play_purchase_token, trial_ends_at').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!p) return s;
  const otherPaying = p.billing_source === 'stripe' && ['trialing', 'active', 'past_due'].includes(p.subscription_status ?? '');
  if (otherPaying && !s.paid) return s;
  // A newer purchase (resubscribe, plan change) replaces the token; an older one doesn't win back.
  if (p.play_purchase_token && p.play_purchase_token !== token && sub.linkedPurchaseToken !== p.play_purchase_token && !s.paid) return s;
  const patch: Record<string, unknown> = {
    billing_source: 'play',
    play_purchase_token: token,
    play_product_id: s.productId,
    subscription_status: s.status,
    current_period_end: s.expiry,
    cancel_at_period_end: s.cancelAtPeriodEnd,
    billing_cycle: s.cycle,
    plan: s.paid ? 'chaser' : 'free',
    updated_at: new Date().toISOString(),
  };
  // Record the trial so the account can't start another one (on Play or with Stripe).
  if (s.trial && !p.trial_ends_at) patch.trial_ends_at = s.expiry;
  // The token was used by another account before (the same Google account bought for two of ours):
  // the newest purchase owner keeps it.
  await db.from('profiles').update({ play_purchase_token: null }).eq('play_purchase_token', token).neq('id', userId);
  const { error: e2 } = await db.from('profiles').update(patch).eq('id', userId);
  if (e2) throw e2;
  return s;
}
