import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { fcmAccount, sendFcm } from './fcm';
import { FLARE_X, REPEAT_HOURS, bzSouth, cmeComing, couplingHigh, decidePlace, flareNow, inQuietHours, normalizeRules, powerJump, shockArrival, stormKp, type AlertKind, type AlertLevel, type AlertRules } from './alerts';
import { kpNeeded, moon, sunAltitude } from './astro';
import { cloudCover, type CloudForecast } from './cloud';
import { enlilSims, hemiPowerSeries, hp30Recent, kpNow, kpSeries, ovalAt, ovation, solarWindSeries, xrayRecent } from './feeds';
import { earthCmes, xrayClass } from './storm';
import { SITE } from './site';
import { hourlyScores } from './tonight';
import { isLocale, type Locale } from '../i18n/config';
import { getI18n } from '../i18n/server';

/**
 * The alert engine, run every 10 minutes by /api/alerts/run. For every user with alerts on it scores
 * their locations with the same model as the verdict card (lib/tonight), decides what to send (lib/alerts),
 * skips repeats and quiet hours, emails what's left and logs every alert in alert_log.
 */

interface Settings { user_id: string; kp_threshold: number; rules: unknown; time_zone: string | null; channels: Record<string, boolean> | null; triggers?: Record<string, boolean> | null }
interface Profile { id: string; plan: string | null; subscription_status: string | null; trial_ends_at: string | null; locale: string | null }
interface Loc { id: string; user_id: string; name: string; lat: number; lon: number; is_home: boolean }
interface Alert {
  kind: AlertKind; location: Loc | null; level: AlertLevel | null; score: number | null; kp: number | null; look?: 'low' | 'high' | 'overhead';
  /** Technical alerts: Bz (nT), or the hemispheric power reached (GW) with `from` the power before. */
  value?: number; from?: number;
  /** CME forecasts: the expected arrival time, and whether it's a glancing blow. */
  when?: number; glancing?: boolean;
}

export interface RunSummary {
  users: number; places: number; alerts: number; emailed: number; pushed: number; failed: number; noProvider: number; skippedQuiet: number;
  /** Users not reached this run (out of time, or their batch couldn't be read); they come first next run. */
  deferred: number;
  /** False when Kp and the OVATION model were both unavailable, so nothing could be judged. */
  feedsOk: boolean;
}

/** Mirrors public.effective_plan(): a paid plan counts while its subscription or trial is live. */
function isChaser(p: Profile | undefined, now: number): boolean {
  if (!p || !p.plan || p.plan === 'free') return false;
  if (p.subscription_status && ['trialing', 'active', 'past_due'].includes(p.subscription_status)) return true;
  return !!p.trial_ends_at && Date.parse(p.trial_ends_at) > now;
}

/** Users read together (plan, places, recent alerts): keeps every query's URL short. */
const BATCH = 100;
/** Users alerted at the same time within a batch. */
const PARALLEL = 5;
/** No new user is started after this long, so a run finishes inside the route's 60-second limit. */
const BUDGET_MS = 40_000;

/** Every alert_settings row, a page at a time (the API returns at most 1,000 rows per request). */
async function allSettings(admin: SupabaseClient): Promise<Settings[]> {
  const out: Settings[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('alert_settings').select('user_id, kp_threshold, rules, time_zone, channels, triggers')
      .order('user_id').range(from, from + 999);
    if (error) throw new Error(`alert_settings: ${error.message}`);
    out.push(...(data as Settings[]));
    if (data.length < 1000) return out;
  }
}

export async function runAlerts(admin: SupabaseClient, now = Date.now()): Promise<RunSummary> {
  const started = Date.now();
  const summary: RunSummary = { users: 0, places: 0, alerts: 0, emailed: 0, pushed: 0, failed: 0, noProvider: 0, skippedQuiet: 0, deferred: 0, feedsOk: true };
  const on = (s: Settings, ...keys: string[]) => keys.some(k => !!s.triggers?.[k]);
  const technical = (s: Settings) => on(s, 'bz', 'sub', 'coupling', 'flare', 'cme');
  const active = (await allSettings(admin)).filter(s => { const r = normalizeRules(s.rules); return r.aurora || r.storm || technical(s); });
  if (!active.length) return summary;

  const [kpLatest, series, oval] = await Promise.all([kpNow(), kpSeries(), ovation()]);
  const kp = kpLatest?.kp ?? null;
  // With no Kp and no OVATION model nothing can be judged, so nothing is sent and the run says why.
  summary.feedsOk = kp !== null || series.length > 0 || oval !== null;
  if (!summary.feedsOk) return summary;
  // Storm alerts also read GFZ's half-hourly Hp30 (Kp's scale), so they can go out hours before the 3-hourly Kp.
  const hp = (await hp30Recent()).filter(p => p.t > now - 90 * 6e4).sort((a, b) => b.t - a.t)[0];
  const kpStorm = stormKp(kp, series, now);
  const storm = hp ? Math.max(kpStorm ?? 0, Math.min(9, hp.hp)) : kpStorm;
  // Technical alerts (Chaser): read only when someone has one switched on.
  const any = (...keys: string[]) => active.some(s => on(s, ...keys));
  const [wind, power, xrays, sims] = await Promise.all([
    any('bz', 'sub', 'coupling', 'cme') ? solarWindSeries() : [],
    any('sub') ? hemiPowerSeries() : [],
    any('flare') ? xrayRecent() : [],
    any('cme') ? enlilSims() : null,
  ]);
  const bz = bzSouth(wind, now);
  const jump = { north: powerJump(power, 'north', now), south: powerJump(power, 'south', now) };
  const coupling = couplingHigh(wind, now);
  const shock = shockArrival(wind, now);
  const flare = flareNow(xrays, now);
  const cme = sims ? cmeComing(earthCmes(sims as never, now), now) : null;
  // Cloud forecasts are shared between users with places close together.
  const clouds = new Map<string, Promise<CloudForecast | null>>();
  const cloudAt = (lat: number, lon: number) => {
    const k = `${lat.toFixed(1)},${lon.toFixed(1)}`;
    if (!clouds.has(k)) clouds.set(k, cloudCover(lat, lon));
    return clouds.get(k)!;
  };

  // Each run starts at a different point in the list, so if a run runs out of time it isn't always the
  // same users who wait for the next one.
  const shift = (Math.floor(now / 6e5) * 7919) % active.length;
  const order = [...active.slice(shift), ...active.slice(0, shift)];

  for (let b = 0; b < order.length; b += BATCH) {
    const batch = order.slice(b, b + BATCH);
    if (Date.now() - started > BUDGET_MS) { summary.deferred += order.length - b; break; }
    const ids = batch.map(s => s.user_id);
    const [profilesRes, locsRes, logRes] = await Promise.all([
      admin.from('profiles').select('id, plan, subscription_status, trial_ends_at, locale').in('id', ids),
      admin.from('locations').select('id, user_id, name, lat, lon, is_home').in('user_id', ids),
      admin.from('alert_log').select('user_id, location_id, kind, value, created_at').in('user_id', ids).gte('created_at', new Date(now - 72 * 36e5).toISOString()),
    ]);
    // Without plans, places or the recent log, alerts could go out wrongly or twice: skip the batch.
    const readError = profilesRes.error ?? locsRes.error ?? logRes.error;
    if (readError) {
      summary.deferred += batch.length;
      console.error('alert run: batch skipped', readError.message);
      continue;
    }
    const profiles = new Map((profilesRes.data as Profile[]).map(p => [p.id, p]));
    const locsBy = new Map<string, Loc[]>();
    for (const l of locsRes.data as Loc[]) locsBy.set(l.user_id, [...(locsBy.get(l.user_id) ?? []), l]);
    const recent = logRes.data as { user_id: string; location_id: string | null; kind: AlertKind; value: number | null; created_at: string }[];
    const sentWithin = (user: string, loc: string | null, kinds: AlertKind[], hours: number, match: (value: number | null) => boolean = () => true) =>
      recent.some(r => r.user_id === user && r.location_id === loc && kinds.includes(r.kind) && Date.parse(r.created_at) > now - hours * 36e5 && match(r.value));

    const processUser = async (s: Settings) => {
      summary.users++;
      // One user's failure (bad saved data, a delivery error) never stops the run for everyone else.
      try {
        const rules: AlertRules = normalizeRules(s.rules);
        const profile = profiles.get(s.user_id);
        const chaser = isChaser(profile, now);
        const alerts: Alert[] = [];

        if (rules.storm && storm !== null && storm >= s.kp_threshold && !sentWithin(s.user_id, null, ['storm'], REPEAT_HOURS.storm)) {
          alerts.push({ kind: 'storm', location: null, level: null, score: null, kp: storm });
        }

        const quiet = inQuietHours(rules, now, s.time_zone);
        const all = locsBy.get(s.user_id) ?? [];

        // Technical alerts (Chaser), never in quiet hours. Flares and CMEs whatever the time of day.
        if (chaser && !quiet) {
          // A flare: once in 2 hours, unless it grows from M to X.
          if (s.triggers?.flare && flare && (!sentWithin(s.user_id, null, ['flare'], REPEAT_HOURS.flare)
            || (flare.flux >= FLARE_X && !sentWithin(s.user_id, null, ['flare'], REPEAT_HOURS.flare, v => (v ?? 0) >= FLARE_X)))) {
            alerts.push({ kind: 'flare', location: null, level: null, score: null, kp, value: flare.flux });
          }
          if (s.triggers?.cme && shock && !sentWithin(s.user_id, null, ['shock'], REPEAT_HOURS.shock)) {
            alerts.push({ kind: 'shock', location: null, level: null, score: null, kp, value: shock.to, from: shock.from });
          }
          // A CME forecast: once per expected arrival (logged in hours since 1970), however often the model reruns.
          const arrivalH = cme ? Math.round(cme.arrival / 36e5) : null;
          if (s.triggers?.cme && cme && arrivalH !== null && !sentWithin(s.user_id, null, ['cme'], 72, v => v !== null && Math.abs(v - arrivalH) < 12)) {
            alerts.push({ kind: 'cme', location: null, level: null, score: null, kp: cme.kp, value: arrivalH, when: cme.arrival, glancing: cme.glancing });
          }
        }
        // Bz, substorm onset and strong coupling: Chaser, while it's dark at Home and outside quiet hours.
        const home = all.find(l => l.is_home) ?? null;
        if (chaser && home && !quiet && sunAltitude(now, home.lat, home.lon) <= -6) {
          if (s.triggers?.coupling && coupling && !sentWithin(s.user_id, null, ['coupling'], REPEAT_HOURS.coupling)) {
            alerts.push({ kind: 'coupling', location: null, level: null, score: null, kp, value: coupling.value });
          }
          if (s.triggers?.bz && bz && !sentWithin(s.user_id, null, ['bz'], REPEAT_HOURS.bz)) {
            alerts.push({ kind: 'bz', location: null, level: null, score: null, kp, value: bz.bz });
          }
          const j = jump[home.lat < 0 ? 'south' : 'north'];
          if (s.triggers?.sub && j && !sentWithin(s.user_id, null, ['substorm'], REPEAT_HOURS.substorm)) {
            alerts.push({ kind: 'substorm', location: null, level: null, score: null, kp, value: j.to, from: j.from });
          }
        }
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
        if (!alerts.length) return;
        summary.alerts += alerts.length;

        const locale: Locale = profile?.locale && isLocale(profile.locale) ? profile.locale : 'en';
        const texts = await alertTexts(locale, alerts, s.time_zone);
        const [email, push] = await Promise.all([deliverEmail(admin, s, texts), deliverPush(admin, s, chaser, texts)]);
        if (email === 'sent') summary.emailed++;
        if (push === 'sent') summary.pushed++;
        if (email === 'no_provider') summary.noProvider++;
        if (email.startsWith('failed') || push.startsWith('failed')) summary.failed++;

        const { error: logError } = await admin.from('alert_log').insert(alerts.map(a => ({
          user_id: s.user_id, location_id: a.location?.id ?? null, kind: a.kind, level: a.level, score: a.score, kp: a.kp,
          place: a.location?.name ?? null, value: a.value ?? null, delivery: { email, push },
        })));
        // Without the log entry the same alert would go out again next run; make that visible.
        if (logError) throw new Error(`alert_log insert: ${logError.message}`);
      } catch (e) {
        summary.failed++;
        console.error('alert run: user failed', s.user_id.slice(0, 8), (e as Error).message);
      }
    };

    let next = 0;
    await Promise.all(Array.from({ length: Math.min(PARALLEL, batch.length) }, async () => {
      while (next < batch.length) {
        const s = batch[next++];
        if (Date.now() - started > BUDGET_MS) { summary.deferred++; continue; }
        await processUser(s);
      }
    }));
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
      // A slow service never holds up the alert run.
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.ALERTS_FROM || `${SITE.name} <alerts@${SITE.domain}>`, to, subject, html, text }),
    });
    return res.ok ? 'sent' : `failed: ${res.status}`;
  } catch (e) {
    return `failed: ${(e as Error).message.slice(0, 80)}`;
  }
}

/** Push services browsers use; a stored endpoint anywhere else is never contacted (users write their own rows). */
const PUSH_HOSTS = /^([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/;
const FCM_TOKEN = /^fcm:[A-Za-z0-9_:-]{20,4096}$/;

export function pushEndpointOk(kind: string | null, endpoint: string): boolean {
  if (kind === 'fcm') return FCM_TOKEN.test(endpoint);
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

/** Most devices one user's alert is pushed to, newest first. */
const MAX_DEVICES = 10;

/**
 * One push per user per run to each device they switched on (Chaser): browsers by web push, the Android
 * app through Firebase (rows of kind 'fcm', endpoint 'fcm:<token>'). Subscriptions the push service
 * reports as gone are removed.
 */
async function deliverPush(admin: SupabaseClient, s: Settings, chaser: boolean, texts: AlertTexts): Promise<string> {
  if (!chaser) return 'plan';
  if (!s.channels?.push) return 'off';
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  const webReady = !!pub && !!priv, appReady = !!fcmAccount();
  if (!webReady && !appReady) return 'not_configured';
  const { data: all } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth, kind')
    .eq('user_id', s.user_id).order('created_at', { ascending: false }).limit(MAX_DEVICES);
  const subs = (all ?? []).filter(x => (x.kind === 'fcm' ? appReady : webReady) && pushEndpointOk(x.kind, x.endpoint));
  if (!subs.length) return all?.length ? 'not_configured' : 'no_device';
  const [first] = texts.lines;
  const payload = JSON.stringify({
    title: first.subject,
    body: texts.lines.length > 1 ? texts.lines.map(l => l.subject).join(' · ') : `${first.body}${first.look ? ` ${first.look}.` : ''}`,
    url: texts.url, tag: `alert-${texts.lines.map(l => l.kind).join('-')}`,
  });
  const opts = { vapidDetails: { subject: process.env.VAPID_SUBJECT || `mailto:alerts@${SITE.domain}`, publicKey: pub ?? '', privateKey: priv ?? '' }, TTL: 3600, urgency: 'high' as const, timeout: 5000 };
  let sent = 0, failed = '';
  // The result shows only one outcome, so a device that fails while another succeeds is logged here.
  const fail = (kind: string, why: string) => { failed = why; console.warn('push failed', kind, s.user_id.slice(0, 8), why); };
  for (const sub of subs) {
    if (sub.kind === 'fcm') {
      const { title, body, url, tag } = JSON.parse(payload) as { title: string; body: string; url: string; tag: string };
      try {
        const r = await sendFcm(sub.endpoint.slice(4), { title, body, url, tag });
        if (r === 'sent') sent++;
        else if (r === 'gone') await admin.from('push_subscriptions').delete().eq('id', sub.id);
        else fail(sub.kind, r);
      } catch (e) {
        fail(sub.kind, `failed: ${(e as Error).message.slice(0, 60)}`);
      }
      continue;
    }
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, opts);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id);
      else fail(sub.kind, `failed: ${code ?? (e as Error).message.slice(0, 60)}`);
    }
  }
  return sent ? 'sent' : failed || 'no_device';
}

const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

interface AlertLine { kind: AlertKind; subject: string; body: string; look: string }
interface AlertTexts { lines: AlertLine[]; url: string; cta: string; footer: string; /** Language of the email (html lang). */ lang: Locale }

/** The wording of a run's alerts in one language, shared by email and push. */
async function alertTexts(locale: Locale, alerts: Alert[], timeZone: string | null = null): Promise<AlertTexts> {
  const { t } = await getI18n(locale);
  const order: AlertKind[] = ['storm', 'substorm', 'shock', 'aurora', 'bz', 'coupling', 'flare', 'cme', 'forecast'];
  const sorted = [...alerts].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const line = (a: Alert) => {
    if (a.kind === 'storm') {
      const k = Math.max(2, Math.min(9, Math.round(a.kp ?? 5))) as 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      return { kind: a.kind, subject: t('mail.storm.subject', { kp: Math.round((a.kp ?? 0) * 10) / 10 }), body: t('mail.storm.body', { kp: Math.round((a.kp ?? 0) * 10) / 10, name: t(`kp.name.${k}`) }), look: '' };
    }
    if (a.kind === 'bz') return { kind: a.kind, subject: t('mail.bz.subject', { bz: a.value ?? 0 }), body: t('mail.bz.body', { bz: a.value ?? 0 }), look: '' };
    if (a.kind === 'substorm') return { kind: a.kind, subject: t('mail.substorm.subject'), body: t('mail.substorm.body', { from: a.from ?? 0, to: a.value ?? 0 }), look: '' };
    if (a.kind === 'coupling') return { kind: a.kind, subject: t('mail.coupling.subject'), body: t('mail.coupling.body', { value: Math.round((a.value ?? 0) / 1000) }), look: '' };
    if (a.kind === 'flare') { const cls = xrayClass(a.value ?? 0); return { kind: a.kind, subject: t('mail.flare.subject', { cls }), body: t(cls.startsWith('X') ? 'mail.flare.bodyX' : 'mail.flare.body', { cls }), look: '' }; }
    if (a.kind === 'shock') return { kind: a.kind, subject: t('mail.shock.subject'), body: t('mail.shock.body', { from: a.from ?? 0, to: a.value ?? 0 }), look: '' };
    if (a.kind === 'cme') {
      let when: string;
      try { when = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: timeZone ?? 'UTC', timeZoneName: 'short' }).format(a.when ?? 0); }
      catch { when = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(a.when ?? 0); }
      const kp = a.kp === null ? '' : t('mail.cme.kp', { kp: a.kp });
      return { kind: a.kind, subject: t('mail.cme.subject', { when }), body: t(a.glancing ? 'mail.cme.bodyGlancing' : 'mail.cme.body', { when, kp }), look: '' };
    }
    const place = (a.location?.name ?? '').split(',')[0];
    const look = a.look === 'overhead' ? t('tonight.look.overhead') : t(`tonight.look.${a.look ?? 'low'}.${(a.location?.lat ?? 1) < 0 ? 'south' : 'north'}`);
    return a.kind === 'aurora'
      ? { kind: a.kind, subject: t('mail.aurora.subject', { place, level: t(`alerts.level.${a.level!}`) }), body: t('mail.aurora.body', { place, level: t(`mail.level.${a.level!}`), score: a.score ?? 0 }), look }
      : { kind: a.kind, subject: t('mail.forecast.subject', { place }), body: t('mail.forecast.body', { place, level: t(`mail.level.${a.level!}`), score: a.score ?? 0 }), look };
  };
  return { lines: sorted.map(line), url: `${SITE.url}/${locale}`, cta: t('mail.cta'), footer: t('mail.footer'), lang: locale };
}

function renderEmail({ lines, url, cta, footer, lang }: AlertTexts) {
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;background:#000;color:#fff;font-family:Helvetica,Arial,sans-serif">
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
export async function sendTestAlert(admin: SupabaseClient, userId: string, samples = false): Promise<{ email: string; push: string }> {
  const { data: p } = await admin.from('profiles').select('id, plan, subscription_status, trial_ends_at, locale').eq('id', userId).maybeSingle();
  const profile = (p ?? undefined) as Profile | undefined;
  const locale: Locale = isLocale(profile?.locale) ? profile!.locale as Locale : 'en';
  const { t } = await getI18n(locale);
  // With `samples`, the test also shows each technical alert as it would read, with made-up readings.
  const { data: settings } = await admin.from('alert_settings').select('time_zone').eq('user_id', userId).maybeSingle();
  const now = Date.now();
  const sample: Alert[] = samples ? [
    { kind: 'bz', location: null, level: null, score: null, kp: null, value: -12.4 },
    { kind: 'substorm', location: null, level: null, score: null, kp: null, value: 52, from: 14 },
    { kind: 'coupling', location: null, level: null, score: null, kp: null, value: 18_400 },
    { kind: 'shock', location: null, level: null, score: null, kp: null, value: 560, from: 410 },
    { kind: 'cme', location: null, level: null, score: null, kp: 7, value: Math.round((now + 36 * 36e5) / 36e5), when: now + 36 * 36e5, glancing: false },
    { kind: 'flare', location: null, level: null, score: null, kp: null, value: 1.3e-4 },
  ] : [];
  const { lines, url, cta, footer, lang } = await alertTexts(locale, sample, settings?.time_zone ?? null);
  const texts: AlertTexts = {
    lines: [{ kind: 'aurora', subject: t('mail.test.subject', { name: SITE.name }), body: t(samples ? 'mail.test.bodySamples' : 'mail.test.body'), look: '' }, ...lines],
    url, cta, footer, lang,
  };
  const s: Settings = { user_id: userId, kp_threshold: 0, rules: null, time_zone: null, channels: { email: true, push: true } };
  const [email, push] = await Promise.all([deliverEmail(admin, s, texts), deliverPush(admin, s, isChaser(profile, Date.now()), texts)]);
  return { email, push };
}
