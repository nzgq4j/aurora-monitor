import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { PRICE_LOOKUP, TRIAL_DAYS, billingProfile, customerFor, siteUrl, stripe, userFromRequest } from '../../../../lib/billing';

/** Errors the client turns into messages; `payments_off` means Stripe isn't configured yet. */
export type CheckoutError = 'payments_off' | 'signed_out' | 'already_subscribed' | 'bad_request' | 'failed';

/**
 * Start a Stripe Checkout session for a paid plan. The first subscription gets the free trial;
 * a card is always collected, and tax is calculated from the customer's billing address.
 */
export async function POST(req: Request) {
  const fail = (error: CheckoutError, status: number) => NextResponse.json({ error }, { status });
  const s = stripe();
  if (!s) return fail('payments_off', 503);
  const user = await userFromRequest(req);
  if (!user) return fail('signed_out', 401);
  const { tier = 'chaser', cycle } = await req.json().catch(() => ({})) as { tier?: string; cycle?: string };
  const key = tier === 'chaser' && (cycle === 'monthly' || cycle === 'annual') ? PRICE_LOOKUP.chaser[cycle] : null;
  if (!key) return fail('bad_request', 400);
  const profile = await billingProfile(user.id);
  if (!profile) return fail('failed', 500);
  if (['trialing', 'active', 'past_due'].includes(profile.subscription_status ?? '')) return fail('already_subscribed', 409);

  try {
    const { data: [price] } = await s.prices.list({ lookup_keys: [key], active: true, limit: 1 });
    if (!price) throw new Error(`No active Stripe price with lookup key ${key}`);
    const customer = await customerFor(s, user, profile);
    // One free trial per account, whether it was the earlier no-card trial or a Stripe one.
    const trial: Stripe.Checkout.SessionCreateParams.SubscriptionData = profile.trial_ends_at ? {} : {
      trial_period_days: TRIAL_DAYS,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    };
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: { ...trial, metadata: { user_id: user.id } },
      payment_method_collection: 'always',
      automatic_tax: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      allow_promotion_codes: true,
      locale: (profile.locale ?? 'auto') as Stripe.Checkout.SessionCreateParams.Locale,
      success_url: siteUrl(req, '/dashboard?checkout=success'),
      cancel_url: siteUrl(req, '/checkout?checkout=cancelled'),
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('stripe checkout', e);
    return fail('failed', 500);
  }
}
