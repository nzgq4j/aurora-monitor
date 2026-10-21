import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/billing';
import { getPlaySubscription, playAccount, syncPlay } from '../../../../lib/play';

export const dynamic = 'force-dynamic';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Google Play real-time developer notifications, pushed by a Pub/Sub subscription to
 * /api/play/rtdn?token=<PLAY_RTDN_TOKEN>. Each subscription change (renewal, cancellation, grace
 * period, expiry …) re-reads the subscription from Google and updates the profile it belongs to.
 * Answers 200 for anything it can't use, so Pub/Sub doesn't retry it forever, and 500 when Google
 * couldn't be reached, so it does.
 */
export async function POST(req: Request) {
  const secret = process.env.PLAY_RTDN_TOKEN;
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!secret || !same(token, secret)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  if (!playAccount()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const body = await req.json().catch(() => null) as { message?: { data?: string } } | null;
  let note: { subscriptionNotification?: { purchaseToken?: string; notificationType?: number }; testNotification?: object } | null = null;
  try { note = JSON.parse(Buffer.from(body?.message?.data ?? '', 'base64').toString('utf8')); } catch { /* not JSON */ }
  if (note?.testNotification) { console.log('play rtdn test'); return NextResponse.json({ ok: true }); }
  const purchaseToken = note?.subscriptionNotification?.purchaseToken;
  if (!purchaseToken) return NextResponse.json({ ok: true, ignored: true });

  try {
    const sub = await getPlaySubscription(purchaseToken);
    if (!sub) return NextResponse.json({ ok: true, ignored: 'unknown' });
    let userId = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    if (!userId) {
      const { data } = await supabaseAdmin().from('profiles').select('id').eq('play_purchase_token', purchaseToken).maybeSingle();
      userId = data?.id;
    }
    if (!userId) return NextResponse.json({ ok: true, ignored: 'no_account' });
    const s = await syncPlay(userId, purchaseToken, sub);
    console.log('play rtdn', note?.subscriptionNotification?.notificationType, userId.slice(0, 8), s.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('play rtdn', (e as Error).message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
