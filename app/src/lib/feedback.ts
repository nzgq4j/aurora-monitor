import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SITE } from './site';

export type FeedbackKind = 'issue' | 'idea' | 'other';
export const FEEDBACK_KINDS: FeedbackKind[] = ['issue', 'idea', 'other'];
/** Message length the form and the table accept. */
export const FEEDBACK_MIN = 5;
export const FEEDBACK_MAX = 4000;
/** Reports one account may send in an hour. */
export const FEEDBACK_PER_HOUR = 5;

export interface FeedbackReport {
  kind: FeedbackKind;
  message: string;
  email: string | null;
  name: string | null;
  context: Record<string, string>;
}

const esc = (x: string) => x.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const LABEL: Record<FeedbackKind, string> = { issue: 'Issue', idea: 'Feature request', other: 'Feedback' };

/** The admins' email for one report; replying answers the member. */
export function renderFeedbackEmail(r: FeedbackReport) {
  const first = r.message.replace(/\s+/g, ' ').trim();
  const subject = `${LABEL[r.kind]}: ${first.length > 60 ? `${first.slice(0, 57)}…` : first}`;
  const who = [r.name, r.email].filter(Boolean).join(' · ') || 'A member';
  const ctx = Object.entries(r.context).filter(([, v]) => v);
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#000;color:#fff;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="font-size:20px;font-weight:800;letter-spacing:.02em;padding-bottom:24px">POLAR <span style="color:#6CFF2B">LIGHTS</span></td></tr>
<tr><td style="padding:0 0 6px;font-size:13px;letter-spacing:.06em;color:#6CFF2B;font-weight:700">${esc(LABEL[r.kind].toUpperCase())}</td></tr>
<tr><td style="padding:0 0 18px;font-size:15px;color:#9AA39D">From ${esc(who)}</td></tr>
<tr><td style="padding:0 0 22px;font-size:16px;line-height:1.55;color:#e6ebe7;white-space:pre-wrap">${esc(r.message)}</td></tr>
${ctx.length ? `<tr><td style="padding:14px 0 0;border-top:1px solid #1c211e;font-size:12px;line-height:1.6;color:#9AA39D">${ctx.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</td></tr>` : ''}
<tr><td style="padding:22px 0 0;font-size:12px;color:#9AA39D">Reply to this email to answer the member.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [`${LABEL[r.kind]} from ${who}`, '', r.message, '', ...ctx.map(([k, v]) => `${k}: ${v}`)].join('\n');
  return { subject, html, text };
}

/** Emails a report to the admins (the `admins` table), with the member as reply-to. */
export async function emailFeedback(admin: SupabaseClient, r: FeedbackReport): Promise<'sent' | 'no_provider' | 'no_admins' | 'failed'> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return 'no_provider';
  const { data: admins } = await admin.from('admins').select('user_id');
  const to = (await Promise.all((admins ?? []).map(a => admin.auth.admin.getUserById(a.user_id))))
    .map(x => x.data.user?.email).filter((e): e is string => !!e);
  if (!to.length) return 'no_admins';
  const { subject, html, text } = renderFeedbackEmail(r);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.ALERTS_FROM || `${SITE.name} <alerts@${SITE.domain}>`, to, subject, html, text,
        ...(r.email ? { reply_to: r.email } : {}),
      }),
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
