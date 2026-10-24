import { NextResponse } from 'next/server';
import { supabaseAdmin, userFromRequest } from '../../../lib/billing';
import { FEEDBACK_KINDS, FEEDBACK_MAX, FEEDBACK_MIN, FEEDBACK_PER_HOUR, emailFeedback, type FeedbackKind } from '../../../lib/feedback';

export const dynamic = 'force-dynamic';

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

/**
 * A member reports an issue or asks for a feature (dashboard form). Saved in `feedback` and emailed to the
 * admins, who can reply to the member directly. Signed-in members only, up to FEEDBACK_PER_HOUR an hour.
 */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { kind?: string; message?: string; context?: Record<string, unknown> };
  const kind = body.kind as FeedbackKind;
  const message = (body.message ?? '').trim();
  if (!FEEDBACK_KINDS.includes(kind) || message.length < FEEDBACK_MIN || message.length > FEEDBACK_MAX) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { count } = await admin.from('feedback').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', new Date(Date.now() - 36e5).toISOString());
  if ((count ?? 0) >= FEEDBACK_PER_HOUR) return NextResponse.json({ error: 'limit' }, { status: 429 });

  const c = body.context ?? {};
  const { data: profile } = await admin.from('profiles').select('display_name, plan').eq('id', user.id).maybeSingle();
  const context: Record<string, string> = {
    where: clip(c.where, 20),
    language: clip(c.language, 10),
    plan: profile?.plan ?? '',
    device: clip(c.device, 300),
    build: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
  };
  const { error } = await admin.from('feedback').insert({ user_id: user.id, kind, message, context });
  if (error) {
    console.error('feedback: save failed', error.message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
  const mail = await emailFeedback(admin, { kind, message, email: user.email ?? null, name: profile?.display_name ?? null, context });
  if (mail !== 'sent') console.warn('feedback: saved but not emailed', mail);
  return NextResponse.json({ ok: true });
}
