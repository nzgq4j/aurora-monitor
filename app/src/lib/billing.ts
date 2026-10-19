import 'server-only';
import Stripe from 'stripe';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { TRIAL_DAYS, type TierId } from '../data';

// Server-only billing helpers for the Stripe routes in app/api/stripe.
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET; prices are found by lookup key (PRICE_LOOKUP),
// so switching between test and live mode needs no code change.

/** Stripe price lookup keys for each paid tier and billing cycle. */
export const PRICE_LOOKUP: Record<Exclude<TierId, 'free'>, Record<'monthly' | 'annual', string>> = {
  chaser: { monthly: 'chaser_monthly', annual: 'chaser_annual' },
};

export { TRIAL_DAYS };

/** Subscription statuses that keep the paid plan in force (matches public.effective_plan in SQL). */
const PAID_STATUSES = new Set<Stripe.Subscription.Status>(['trialing', 'active', 'past_due']);

let stripeClient: Stripe | null = null;
/** Stripe client, or null until STRIPE_SECRET_KEY is set (payments then stay off). */
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return (stripeClient ??= new Stripe(key, { appInfo: { name: 'Polar Lights', url: 'https://www.polarlights.io' } }));
}

let admin: SupabaseClient | null = null;
/** Supabase client with the service role: bypasses row-level security, so use only on the server. */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials are not configured');
  return (admin ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

/** The signed-in user from the request's `Authorization: Bearer <access token>`, or null. */
export async function userFromRequest(req: Request): Promise<User | null> {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  return error ? null : data.user;
}

export interface BillingProfile {
  id: string;
  locale: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
}

export async function billingProfile(userId: string): Promise<BillingProfile | null> {
  const { data } = await supabaseAdmin().from('profiles')
    .select('id, locale, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', userId).maybeSingle();
  return data as BillingProfile | null;
}

/** The user's Stripe customer, created (and remembered on the profile) the first time. */
export async function customerFor(s: Stripe, user: User, profile: BillingProfile): Promise<string> {
  if (profile.stripe_customer_id) return profile.stripe_customer_id;
  const customer = await s.customers.create(
    { email: user.email, metadata: { user_id: user.id }, preferred_locales: profile.locale ? [profile.locale] : undefined },
    // Two quick clicks must not create two customers.
    { idempotencyKey: `customer-${user.id}` },
  );
  // Only set it if still empty, in case another request got there first.
  const { data } = await supabaseAdmin().from('profiles')
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq('id', user.id).is('stripe_customer_id', null).select('stripe_customer_id').maybeSingle();
  return (data?.stripe_customer_id as string | undefined) ?? (await billingProfile(user.id))!.stripe_customer_id!;
}

const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

/**
 * Copy a subscription's state onto the matching profile. Called from the webhook for every
 * subscription event, so the profile always mirrors Stripe (Stripe is the source of truth).
 */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const lookup = item?.price.lookup_key ?? '';
  const tier = (Object.keys(PRICE_LOOKUP) as (keyof typeof PRICE_LOOKUP)[]).find(t => Object.values(PRICE_LOOKUP[t]).includes(lookup)) ?? 'chaser';
  const paid = PAID_STATUSES.has(sub.status);
  const patch: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: iso(item?.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end || !!sub.cancel_at,
    plan: paid ? tier : 'free',
    updated_at: new Date().toISOString(),
  };
  if (item?.price.recurring?.interval) patch.billing_cycle = item.price.recurring.interval === 'year' ? 'annual' : 'monthly';
  // Record the trial so the account can't start another one.
  if (sub.trial_end) patch.trial_ends_at = iso(sub.trial_end);
  const db = supabaseAdmin();
  const { data: linked, error } = await db.from('profiles')
    .select('id, stripe_subscription_id, subscription_status').eq('stripe_customer_id', customer).maybeSingle();
  if (error) throw error;
  // A customer not linked yet (the event beat the checkout's own update) is found by metadata.
  const userId = linked?.id ?? sub.metadata?.user_id;
  if (!userId) throw new Error(`No profile for Stripe customer ${customer}`);
  // Never let an older, ended subscription overwrite a newer one that is still paying.
  if (linked?.stripe_subscription_id && linked.stripe_subscription_id !== sub.id
    && PAID_STATUSES.has(linked.subscription_status as Stripe.Subscription.Status) && !paid) return;
  const { error: e2 } = await db.from('profiles').update({ ...patch, stripe_customer_id: customer }).eq('id', userId);
  if (e2) throw e2;
}

/** Absolute URL on this site for Stripe redirects. */
export function siteUrl(req: Request, path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  return new URL(path, base).toString();
}
