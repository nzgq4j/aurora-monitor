import { NextResponse } from 'next/server';
import { billingProfile, stripe, supabaseAdmin, userFromRequest } from '../../../../lib/billing';
import { PLAY_PRODUCT, cancelPlay, playAccount } from '../../../../lib/play';

export const dynamic = 'force-dynamic';

/**
 * Delete the signed-in account (Settings → Account, in the app and on the website). Billing is closed
 * first: deleting the Stripe customer cancels any Stripe subscription at once, and a Google Play
 * subscription is set not to renew, so nothing is charged again.
 * Then the user is deleted, and the database removes their profile, locations, alert settings and
 * history, push devices and sightings with it (all reference auth.users on delete cascade).
 */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  let admin;
  try { admin = supabaseAdmin(); } catch { return NextResponse.json({ error: 'not_configured' }, { status: 503 }); }

  const profile = await billingProfile(user.id);
  if (profile?.stripe_customer_id) {
    const s = stripe();
    // Never delete an account whose subscription could keep charging.
    if (!s) return NextResponse.json({ error: 'billing_failed' }, { status: 503 });
    try {
      await s.customers.del(profile.stripe_customer_id);
    } catch (e) {
      // Already deleted in Stripe: nothing left to cancel.
      if ((e as { code?: string }).code !== 'resource_missing') {
        console.error('account delete: stripe', user.id.slice(0, 8), e);
        return NextResponse.json({ error: 'billing_failed' }, { status: 502 });
      }
    }
  }

  // A Google Play subscription is set not to renew (it runs to the end of what's been paid).
  const playPaying = profile?.billing_source === 'play' && profile.play_purchase_token && ['trialing', 'active', 'past_due'].includes(profile.subscription_status ?? '');
  if (playPaying) {
    if (!playAccount()) return NextResponse.json({ error: 'billing_failed' }, { status: 503 });
    try {
      await cancelPlay(profile.play_product_id ?? PLAY_PRODUCT, profile.play_purchase_token!);
    } catch (e) {
      console.error('account delete: play', user.id.slice(0, 8), (e as Error).message);
      return NextResponse.json({ error: 'billing_failed' }, { status: 502 });
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('account delete', user.id.slice(0, 8), error.message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
  console.log('account deleted', user.id.slice(0, 8));
  return NextResponse.json({ ok: true });
}
