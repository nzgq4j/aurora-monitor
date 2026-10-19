import { NextResponse } from 'next/server';
import { billingProfile, stripe, supabaseAdmin, userFromRequest } from '../../../../lib/billing';

export const dynamic = 'force-dynamic';

/**
 * Delete the signed-in account (Settings → Account, in the app and on the website). Stripe billing is
 * closed first: deleting the customer cancels any subscription at once, so nothing is charged again.
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

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('account delete', user.id.slice(0, 8), error.message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
  console.log('account deleted', user.id.slice(0, 8));
  return NextResponse.json({ ok: true });
}
