import { NextResponse } from 'next/server';
import { adminFromRequest } from '../../../../lib/adminAuth';
import { supabaseAdmin } from '../../../../lib/billing';
import { BlueskyError, createSession, deleteSession, getSession } from '../../../../lib/bluesky';
import { authFor } from '../../../../lib/socialFeed';
import { supabaseStore } from '../../../../lib/socialStore';

export const dynamic = 'force-dynamic';

const code = (e: unknown) => (e instanceof BlueskyError ? e.error : 'failed');

/**
 * The Bluesky connection (administrators only, checked here on every request).
 * POST {action: 'signin', identifier, password, service?} signs in once with an app password and keeps only
 * the session tokens (Vault); the password is not stored. {action: 'check'} asks Bluesky who we are;
 * {action: 'signout'} ends the session and deletes it.
 */
export async function POST(req: Request) {
  const admin = await adminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });
  const store = supabaseStore(supabaseAdmin());
  const body = (await req.json().catch(() => ({}))) as { action?: string; identifier?: string; password?: string; service?: string };

  if (body.action === 'signin') {
    const identifier = body.identifier?.trim() ?? '', password = body.password ?? '';
    if (!identifier || !password) return NextResponse.json({ error: 'missing' }, { status: 400 });
    try {
      const s = await createSession(identifier, password, body.service?.trim() || null);
      await store.saveSession(s);
      await store.updateSettings({ handle: s.handle, did: s.did, service: s.service, connected_at: new Date().toISOString(), connected_by: admin.id, last_error: null });
      return NextResponse.json({ ok: true, handle: s.handle });
    } catch (e) {
      return NextResponse.json({ error: code(e) }, { status: 400 });
    }
  }

  if (body.action === 'check') {
    const s = await authFor(store);
    if (!s) return NextResponse.json({ error: 'not_connected' }, { status: 409 });
    try {
      const me = await getSession(s);
      await store.updateSettings({ last_error: null, handle: me.handle });
      return NextResponse.json({ ok: true, handle: me.handle });
    } catch (e) {
      await store.updateSettings({ last_error: `check:${code(e)}` });
      return NextResponse.json({ error: code(e) }, { status: 400 });
    }
  }

  if (body.action === 'signout') {
    const s = await store.session();
    if (s) await deleteSession(s).catch(() => { /* the session may already be gone */ });
    await store.saveSession(null);
    await store.updateSettings({ handle: null, did: null, service: null, connected_at: null, connected_by: null, last_error: null });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}
