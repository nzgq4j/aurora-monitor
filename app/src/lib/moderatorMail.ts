import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SITE } from './site';

/** A photo waiting for approval, as listed in the moderators' email. */
export interface Waiting { id: string; handle: string; caption: string | null; place: string | null; thumb: string }

const esc = (x: string) => x.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** Photos shown in one email; the rest are counted. */
const SHOWN = 10;

/** The moderators' email: what came in, and how many are waiting in all. */
export function renderPendingEmail(fresh: Waiting[], total: number) {
  const url = `${SITE.url}/gallery/moderate`;
  const subject = fresh.length === 1 ? `New photo to review from ${fresh[0].handle}` : `${fresh.length} new photos to review`;
  const intro = total > fresh.length ? `${total} photos are waiting for approval in all.` : `${total === 1 ? 'It is' : 'They are'} waiting for your approval.`;
  const rows = fresh.slice(0, SHOWN).map(p => `<tr><td style="padding:0 0 16px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:top"><img src="${esc(p.thumb)}" width="96" alt="" style="display:block;border-radius:8px;width:96px"></td>
<td style="vertical-align:top;font-size:15px;line-height:1.45;color:#e6ebe7"><b style="color:#fff">${esc(p.handle)}</b>${p.place ? ` · ${esc(p.place)}` : ''}${p.caption ? `<br>${esc(p.caption)}` : ''}</td>
</tr></table></td></tr>`).join('');
  const more = fresh.length > SHOWN ? `<tr><td style="padding:0 0 16px;font-size:15px;color:#9AA39D">and ${fresh.length - SHOWN} more</td></tr>` : '';
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#000;color:#fff;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="font-size:20px;font-weight:800;letter-spacing:.02em;padding-bottom:24px">POLAR <span style="color:#6CFF2B">LIGHTS</span></td></tr>
<tr><td style="padding:0 0 20px"><div style="font-size:20px;font-weight:700;color:#6CFF2B;padding-bottom:6px">${esc(subject)}</div><div style="font-size:16px;line-height:1.5;color:#e6ebe7">${esc(intro)}</div></td></tr>
${rows}${more}
<tr><td style="padding:8px 0 28px"><a href="${url}" style="display:inline-block;background:#6CFF2B;color:#000;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px">Review photos</a></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#9AA39D">You get this because you moderate the ${esc(SITE.name)} gallery.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [subject, intro, ...fresh.slice(0, SHOWN).map(p => `- ${p.handle}${p.place ? `, ${p.place}` : ''}${p.caption ? `: ${p.caption}` : ''}`),
    ...(fresh.length > SHOWN ? [`and ${fresh.length - SHOWN} more`] : []), url].join('\n');
  return { subject, html, text };
}

/**
 * Email the moderators about photos posted for review that they haven't been told about yet: one email
 * for everything new. Photos are marked first, so two calls at once can't both send them; if the email
 * can't be sent they're unmarked, and the next call (or the 15-minute check) tries again.
 */
export async function notifyPending(admin: SupabaseClient): Promise<{ notified: number; result: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { notified: 0, result: 'no_provider' };
  const { data: claimed, error } = await admin.from('gallery_photos').update({ notified_at: new Date().toISOString() })
    .eq('status', 'pending').is('notified_at', null).select('id, user_id, caption, place, thumb_path, created_at');
  if (error) return { notified: 0, result: `failed: ${error.message}` };
  if (!claimed?.length) return { notified: 0, result: 'nothing_new' };
  const release = () => admin.from('gallery_photos').update({ notified_at: null }).in('id', claimed.map(p => p.id));

  const [{ data: members }, { data: admins }, { count }] = await Promise.all([
    admin.from('members').select('user_id, handle').in('user_id', [...new Set(claimed.map(p => p.user_id))]),
    admin.from('admins').select('user_id'),
    admin.from('gallery_photos').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const to = (await Promise.all((admins ?? []).map(a => admin.auth.admin.getUserById(a.user_id))))
    .map(r => r.data.user?.email).filter((e): e is string => !!e);
  if (!to.length) { await release(); return { notified: 0, result: 'no_moderators' }; }

  const handle = new Map((members ?? []).map(m => [m.user_id, m.handle as string]));
  const base = admin.storage.from('gallery');
  const fresh: Waiting[] = [...claimed].sort((a, b) => a.created_at.localeCompare(b.created_at)).map(p => ({
    id: p.id, handle: handle.get(p.user_id) ?? 'A member', caption: p.caption, place: p.place, thumb: base.getPublicUrl(p.thumb_path).data.publicUrl,
  }));
  const { subject, html, text } = renderPendingEmail(fresh, Math.max(count ?? 0, fresh.length));
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.ALERTS_FROM || `${SITE.name} <alerts@${SITE.domain}>`, to, subject, html, text }),
    });
    if (res.ok) return { notified: fresh.length, result: 'sent' };
    await release();
    return { notified: 0, result: `failed: ${res.status}` };
  } catch (e) {
    await release();
    return { notified: 0, result: `failed: ${(e as Error).message.slice(0, 80)}` };
  }
}
