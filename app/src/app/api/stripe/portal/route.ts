import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { billingProfile, siteUrl, stripe, userFromRequest } from '../../../../lib/billing';

/** Open Stripe's billing portal: change plan or card, see invoices, cancel. */
export async function POST(req: Request) {
  const s = stripe();
  if (!s) return NextResponse.json({ error: 'payments_off' }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const profile = await billingProfile(user.id);
  if (!profile?.stripe_customer_id) return NextResponse.json({ error: 'no_customer' }, { status: 404 });
  try {
    const session = await s.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: siteUrl(req, '/dashboard'),
      locale: (profile.locale ?? 'auto') as Stripe.BillingPortal.SessionCreateParams.Locale,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('stripe portal', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
