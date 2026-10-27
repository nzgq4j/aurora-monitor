import { NextResponse } from 'next/server';
import { supabaseAdmin, userFromRequest } from '../../../../lib/billing';
import { PLAY_PRODUCT, acknowledgePlay, getPlaySubscription, needsAcknowledging, playAccount, purchaseOwner, syncPlay } from '../../../../lib/play';

export const dynamic = 'force-dynamic';

/**
 * A Google Play purchase from the app: POST { purchaseToken } with the user's Supabase access token.
 * The purchase must have been made for this account (the app passes the user ID to Play as the
 * obfuscated account ID), or have no account at all (a promo code redeemed in the Play Store), which
 * this member then claims unless another member holds it (see purchaseOwner). It is checked with
 * Google, acknowledged, and copied onto the profile.
 */
export async function POST(req: Request) {
  if (!playAccount()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const { purchaseToken } = await req.json().catch(() => ({})) as { purchaseToken?: string };
  if (!purchaseToken || purchaseToken.length > 4096) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    const sub = await getPlaySubscription(purchaseToken);
    if (!sub) return NextResponse.json({ error: 'unknown_purchase' }, { status: 404 });
    const accountId = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    let holder: string | null = null;
    if (!accountId) {
      const { data, error } = await supabaseAdmin().from('profiles').select('id').eq('play_purchase_token', purchaseToken).maybeSingle();
      if (error) throw error;
      holder = data?.id ?? null;
    }
    const owner = purchaseOwner(accountId, user.id, holder);
    if (owner === 'other') return NextResponse.json({ error: 'other_account' }, { status: 403 });
    const product = sub.lineItems?.[0]?.productId ?? PLAY_PRODUCT;
    if (needsAcknowledging(sub)) {
      await acknowledgePlay(product, purchaseToken);
    }
    const s = await syncPlay(user.id, purchaseToken, sub);
    console.log('play verify', user.id.slice(0, 8), s.status, owner === 'claim' ? 'claimed' : '', sub.testPurchase ? 'test' : '');
    return NextResponse.json({ status: s.status, paid: s.paid });
  } catch (e) {
    console.error('play verify', user.id.slice(0, 8), (e as Error).message);
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}
