import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe, syncSubscription } from '../../../../lib/billing';

/**
 * Stripe webhook: keeps each profile's plan in step with its subscription.
 * Subscribe the endpoint to checkout.session.completed and customer.subscription.*.
 * Any error returns 500 so Stripe retries the event.
 */
export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return NextResponse.json({ error: 'payments_off' }, { status: 503 });

  let event: Stripe.Event;
  try {
    // The signature covers the exact raw body, so read it as text before anything parses it.
    event = await s.webhooks.constructEventAsync(await req.text(), req.headers.get('stripe-signature') ?? '', secret);
  } catch {
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  // Events can arrive late or out of order, so always re-read the subscription's current state.
  let subscriptionId: string | null = null;
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.mode === 'subscription' && session.subscription) subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
  } else if (event.type.startsWith('customer.subscription.')) {
    subscriptionId = (event.data.object as Stripe.Subscription).id;
  }
  if (!subscriptionId) return NextResponse.json({ received: true, ignored: event.type });

  try {
    await syncSubscription(await s.subscriptions.retrieve(subscriptionId));
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error('stripe webhook', event.type, event.id, e);
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
  }
}
