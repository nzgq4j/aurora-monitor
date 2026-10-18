import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { DEFAULT_RULES, REPEAT_HOURS, decidePlace, inQuietHours, stormKp, type AlertKind, type AlertLevel, type AlertRules } from './alerts';
import { kpNeeded, moon } from './astro';
import { cloudCover, type CloudForecast } from './cloud';
import { kpNow, kpSeries, ovalAt, ovation } from './feeds';
import { SITE } from './site';
import { hourlyScores } from './tonight';
import { isLocale, type Locale } from '../i18n/config';
import { getI18n } from '../i18n/server';

/**
 * The alert engine, run every 10 minutes by /api/alerts/run. For every user with alerts on it scores
 * their locations with the same model as the verdict card (lib/tonight), decides what to send (lib/alerts),
 * skips repeats and quiet hours, emails what's left and logs every alert in alert_log.
 */

interface Settings { user_id: string; kp_threshold: number; rules: Partial<AlertRules> | null; time_zone: string | null; channels: Record<string, boolean> | null }
interface Profile { id: string; plan: string | null; subscription_status: string | null; trial_ends_at: string | null; locale: string | null }
interface Loc { id: string; user_id: string; name: string; lat: number; lon: number; is_home: boolean }
interface Alert { kind: AlertKind; location: Loc | null; level: AlertLevel | null; score: number | null; kp: number | null; look?: 'low' | 'high' | 'overhead' }

export interface RunSummary { users: number; places: number; alerts: number; emailed: number; pushed: number; failed: number; noProvider: number; skippedQuiet: number }

/** Mirrors public.effective_plan(): a paid plan counts while its subscription or trial is live. */
function isChaser(p: Profile | undefined, now: number): boolean {
  if (!p || !p.plan || p.plan === 'free') return false;
  if (p.subscription_status && ['trialing', 'active', 'past_due'].includes(p.subscription_status)) return true;
  return !!p.trial_ends_at && Date.parse(p.trial_ends_at) > now;
}

export async function runAlerts(admin: SupabaseClient, now = Date.now()): Promise<RunSummary> {
  const summary: RunSummary = { users: 0, places: 0, alerts: 0, emailed: 0, pushed: 0, failed: 0, noProvider: 0, skippedQuiet: 0 };
  const { data: settings, error } = await admin.from('alert_settings').select('user_id, kp_threshold, rules, time_zone, channels');
  if (error) throw new Error(`alert_settings: ${error.message}`);
  const active = (settings as Settings[]).filter(s => { const r = { ...DEFAULT_RULES, ...s.rules }; return r.aurora || r.storm; });
  if (!active.length) return summary;
  const ids = active.map(s => s.user_id);

  const [kpLatest, series, oval, profilesRes, locsRes, logRes] = await Promise.all([
    kpNow(), kpSeries(), ovation(),
    admin.from('profiles').select('id, plan, subscription_status, trial_ends_at, locale').in('id', ids),
    admin.from('locations').select('id, user_id, name, lat, lon, is_home').in('user_id', ids),
    admin.from('alert_log').select('user_id, location_id, kind, created_at').in('user_id', ids).gte('created_at', new Date(now - 12 * 36e5).toISOString()),
  ]);
  const profiles = new Map((profilesRes.data as Profile[] | null ?? []).map(p => [p.id, p]));
  const locsBy = new Map<string, Loc[]>();
  for (const l of (locsRes.data as Loc[] | null ?? [])) locsBy.set(l.user_id, [...(locsBy.get(l.user_id) ?? []), l]);
  const recent = (logRes.data ?? []) as { user_id: string; location_id: string | null; kind: AlertKind; created_at: string }[];
  const sentWithin = (user: string, loc: string | null, kinds: AlertKind[], hours: number) =>
    recent.some(r => r.user_id === user && r.location_id === loc && kinds.includes(r.kind) && Date.parse(r.created_at) > now - hours * 36e5);

  const kp = kpLatest?.kp ?? null;
  const storm = stormKp(kp, series, now);
  // Cloud forecasts are shared between users with places close together.
  const clouds = new Map<string, Promise<CloudForecast | null>>();
  const cloudAt = (lat: number, lon: number) => {
    const k = `${lat.toFixed(1)},${lon.toFixed(1)}`;
    if (!clouds.has(k)) clouds.set(k, cloudCover(lat, lon));
    return clouds.get(k)!;
  };

  for (const s of active) {
    summary.users++;
    const rules: AlertRules = { ...DEFAULT_RULES, ...s.rules };
    const profile = profiles.get(s.user_id);
    const chaser = isChaser(profile, now);
    const alerts: Alert[] = [];

    if (rules.storm && storm !== null && storm >= s.kp_threshold && !sentWithin(s.user_id, null, ['storm'], REPEAT_HOURS.storm)) {
      alerts.push({ kind: 'storm', location: null, level: null, score: null, kp: storm });
    }

    const quiet = inQuietHours(rules, now, s.time_zone);
    const all = locsBy.get(s.user_id) ?? [];
    // Free covers the home location; Chaser covers every saved location.
    const places = chaser ? all.slice(0, 10) : all.filter(l => l.is_home).slice(0, 1);
    if (rules.aurora && quiet && places.length) summary.skippedQuiet++;
    if (rules.aurora && !quiet) {
      for (const loc of places) {
        summary.places++;
        const need = kpNeeded(loc.lat, loc.lon);
        const cloud = await cloudAt(loc.lat, loc.lon);
        const hours = hourlyScores({
          lat: loc.lat, lon: loc.lon, need, kpNow: kp, series,
          ovationNearby: oval ? ovalAt(oval, loc.lat, loc.lon).nearby : null,
          cloudNow: cloud?.aurora ?? null, cloudHourly: cloud?.next12h ?? [],
          moonIllumination: moon(now, loc.lat, loc.lon).illumination, now,
        });
        const d = decidePlace(rules, hours, chaser);
        if (!d) continue;
        // A heads-up isn't repeated after the aurora alert itself has gone out.
        const blockers: AlertKind[] = d.kind === 'aurora' ? ['aurora'] : ['aurora', 'forecast'];
        if (sentWithin(s.user_id, loc.id, blockers, REPEAT_HOURS[d.kind])) continue;
        const margin = (hours[d.kind === 'aurora' ? 0 : 1].kp ?? 0) - need;
        alerts.push({ kind: d.kind, location: loc, level: d.level, score: d.score, kp: hours[0].kp, look: margin >= 3 ? 'overhead' : margin >= 1.5 ? 'high' : 'low' });
      }
    }
    if (!alerts.length) continue;
    summary.alerts += alerts.length;

    const locale: Locale = profile?.locale && isLocale(profile.locale) ? profile.locale : 'en';
    const texts = await alertTexts(locale, alerts);
    const [email, push] = await Promise.all([deliverEmail(admin, s, texts), deliverPush(admin, s, chaser, texts)]);
    if (email === 'sent') summary.emailed++;
    if (push === 'sent') summary.pushed++;
    if (email === 'no_provider') summary.noProvider++;
    if (email.startsWith('failed') || push.startsWith('failed')) summary.failed++;

    await admin.from('alert_log').insert(alerts.map(a => ({
      user_id: s.user_id, location_id: a.location?.id ?? null, kind: a.kind, level: a.level, score: a.score, kp: a.kp,
      place: a.location?.name ?? null, delivery: { email, push },
    })));
  }
  return summary;
}

/** One email per user per run, in the account's language. Returns the delivery state for the log. */
async function deliverEmail(admin: SupabaseClient, s: Settings, texts: AlertTexts): Promise<string> {
  if (s.channels && s.channels.email === false) return 'off';
  const key = process.env.RESEND_API_KEY;
  if (!key) return 'no_provider';
  const { data } = await admin.auth.admin.getUserById(s.user_id);
  const to = data.user?.email;
  if (!to) return 'failed: no address';
  const { subject, html, text } = renderEmail(texts);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.ALERTS_FROM || `${SITE.name} <alerts@${SITE.domain}>`, to, subject, html, text }),
    });
    return res.ok ? 'sent' : `failed: ${res.status}`;
  } catch (e) {
    return `failed: ${(e as Error).message.slice(0, 80)}`;
  }
}

/**
 * One push per user per run to each device they switched on (Chaser). Subscriptions the push service
 * reports as gone (404/410) are removed.
 */
async function deliverPush(admin: SupabaseClient, s: Settings, chaser: boolean, texts: AlertTexts): Promise<string> {
  if (!chaser) return 'plan';
  if (!s.channels?.push) return 'off';
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return 'not_configured';
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', s.user_id);
  if (!subs?.length) return 'no_device';
  const [first] = texts.lines;
  const payload = JSON.stringify({
    title: first.subject,
    body: texts.lines.length > 1 ? texts.lines.map(l => l.subject).join(' · ') : `${first.body}${first.look ? ` ${first.look}.` : ''}`,
    url: texts.url, tag: `alert-${texts.lines.map(l => l.kind).join('-')}`,
  });
  const opts = { vapidDetails: { subject: process.env.VAPID_SUBJECT || `mailto:alerts@${SITE.domain}`, publicKey: pub, privateKey: priv }, TTL: 3600, urgency: 'high' as const };
  let sent = 0, failed = '';
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, opts);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id);
      else failed = `failed: ${code ?? (e as Error).message.slice(0, 60)}`;
    }
  }
  return sent ? 'sent' : failed || 'no_device';
}

const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

interface AlertLine { kind: AlertKind; subject: string; body: string; look: string }
interface AlertTexts { lines: AlertLine[]; url: string; cta: string; footer: string }

/** The wording of a run's alerts in one language, shared by email and push. */
async function alertTexts(locale: Locale, alerts: Alert[]): Promise<AlertTexts> {
  const { t } = await getI18n(locale);
  const order: AlertKind[] = ['storm', 'aurora', 'forecast'];
  const sorted = [...alerts].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const line = (a: Alert) => {
    if (a.kind === 'storm') {
      const k = Math.max(2, Math.min(9, Math.round(a.kp ?? 5))) as 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      return { kind: a.kind, subject: t('mail.storm.subject', { kp: Math.round((a.kp ?? 0) * 10) / 10 }), body: t('mail.storm.body', { kp: Math.round((a.kp ?? 0) * 10) / 10, name: t(`kp.name.${k}`) }), look: '' };
    }
    const place = (a.location?.name ?? '').split(',')[0];
    const look = a.look === 'overhead' ? t('tonight.look.overhead') : t(`tonight.look.${a.look ?? 'low'}.${(a.location?.lat ?? 1) < 0 ? 'south' : 'north'}`);
    return a.kind === 'aurora'
      ? { kind: a.kind, subject: t('mail.aurora.subject', { place, level: t(`alerts.level.${a.level!}`) }), body: t('mail.aurora.body', { place, level: t(`mail.level.${a.level!}`), score: a.score ?? 0 }), look }
      : { kind: a.kind, subject: t('mail.forecast.subject', { place }), body: t('mail.forecast.body', { place, level: t(`mail.level.${a.level!}`), score: a.score ?? 0 }), look };
  };
  return { lines: sorted.map(line), url: `${SITE.url}/${locale}`, cta: t('mail.cta'), footer: t('mail.footer') };
}

function renderEmail({ lines, url, cta, footer }: AlertTexts) {
  const html = `<!doctype html><html><body style="margin:0;background:#000;color:#fff;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="font-size:20px;font-weight:800;letter-spacing:.02em;padding-bottom:24px">POLAR <span style="color:#6CFF2B">LIGHTS</span></td></tr>
${lines.map(l => `<tr><td style="padding:0 0 20px"><div style="font-size:20px;font-weight:700;color:#6CFF2B;padding-bottom:6px">${esc(l.subject)}</div><div style="font-size:16px;line-height:1.5;color:#e6ebe7">${esc(l.body)}${l.look ? `<br>${esc(l.look)}.` : ''}</div></td></tr>`).join('')}
<tr><td style="padding:8px 0 28px"><a href="${url}" style="display:inline-block;background:#6CFF2B;color:#000;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px">${esc(cta)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#9AA39D">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [...lines.map(l => `${l.subject}\n${l.body}${l.look ? `\n${l.look}.` : ''}`), url, footer].join('\n\n');
  return { subject: lines[0].subject, html, text };
}

/**
 * A one-off test alert to one account, by email and push (every saved device), whatever its channel
 * switches say, so the delivery path can be checked end to end. Clearly labelled as a test; nothing
 * is written to alert_log. Push still needs Chaser, as for real alerts.
 */
export async function sendTestAlert(admin: SupabaseClient, userId: string): Promise<{ email: string; push: string }> {
  const { data: p } = await admin.from('profiles').select('id, plan, subscription_status, trial_ends_at, locale').eq('id', userId).maybeSingle();
  const profile = (p ?? undefined) as Profile | undefined;
  const { cta, footer } = await alertTexts(isLocale(profile?.locale) ? profile!.locale as Locale : 'en', []);
  const texts: AlertTexts = {
    lines: [{ kind: 'aurora', subject: `Test alert from ${SITE.name}`, body: 'This is a test of your aurora alerts. When aurora reaches your level at one of your locations, the alert arrives like this.', look: '' }],
    url: SITE.url, cta, footer,
  };
  const s: Settings = { user_id: userId, kp_threshold: 0, rules: null, time_zone: null, channels: { email: true, push: true } };
  const [email, push] = await Promise.all([deliverEmail(admin, s, texts), deliverPush(admin, s, isChaser(profile, Date.now()), texts)]);
  return { email, push };
}
