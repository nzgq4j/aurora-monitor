'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PAYMENTS, initials, useAuth } from '../lib/auth';
import { C, CHANNEL_DEFS, TIERS, TRIGGER_DEFS, f, kpBarColor, kpColor } from '../data';
import { G_SCALE, kpNeeded, moon } from '../lib/astro';
import type { AccountData } from '../lib/history';
import { searchPlaces, useLocations, type PlaceResult, type SavedLocation } from '../lib/locations';
import { useConditions } from '../lib/useConditions';
import { ALERT_LEVELS, levelKp, type AlertKind, type AlertLevel, type AlertRules } from '../lib/alerts';
import { supabase } from '../lib/supabase';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import { INSTALL_EVENT } from '../components/InstallPrompt';
import { useStore, type Tab } from '../store';
import { Field } from '../components/Field';
import { Plans } from './Plans';
import { applyLocale, useI18n, type I18n } from '../i18n/I18n';
import { LOCALES, LOCALE_NAMES, isLocale } from '../i18n/config';
import type { MessageKey } from '../i18n/core';

const TABS: Tab[] = ['overview', 'alerts', 'locations', 'plans', 'account'];

/** Kp level name for 2–9 (`kp.name.{n}`). */
const kpName = (t: I18n['t'], k: number) => t(`kp.name.${Math.max(2, Math.min(9, Math.round(k))) as 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`);

export function Account({ data }: { data: AccountData }) {
  const { s, set, signOut, live } = useStore();
  const auth = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  // With real accounts, the Dashboard needs a signed-in user.
  useEffect(() => { if (live && auth.ready && !auth.user) router.replace('/signin?next=/dashboard'); }, [live, auth.ready, auth.user, router]);
  // Back from Stripe Checkout: the webhook updates the plan within seconds, so re-read the profile until it has.
  const userId = auth.user?.id;
  const { refreshProfile } = auth;
  useEffect(() => {
    if (!live || !userId || new URLSearchParams(window.location.search).get('checkout') !== 'success') return;
    window.history.replaceState(null, '', '/dashboard');
    set({ tab: 'overview', toast: t('toast.checkoutDone') });
    let tries = 0;
    const id = setInterval(async () => {
      const p = await refreshProfile();
      if (++tries >= 10 || p?.subscriptionStatus) clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
  }, [live, userId]); // eslint-disable-line react-hooks/exhaustive-deps -- run once per sign-in
  if (live && !auth.user) {
    return <main className="wrap" style={{ padding: '64px var(--gutter)', color: 'var(--muted)' }}>{auth.ready ? t('dash.redirecting') : t('dash.loading')}</main>;
  }
  const name = live ? auth.profile?.displayName || auth.user?.email?.split('@')[0] || t('dash.yourAccount') : 'Sam Rivera';
  const email = live ? auth.user?.email ?? '' : 'sam@example.com';
  return (
    <main data-screen-label="Dashboard" className="wrap account">
      <aside className="account-aside">
        <div className="account-profile">
          <span className="avatar" style={{ width: 44, height: 44, flex: 'none' }}>{live ? initials(auth.profile?.displayName, email) : 'SR'}</span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
          </div>
        </div>
        <nav role="tablist" className="account-tabs">
          {TABS.map(id => {
            const on = s.tab === id;
            return (
              <button key={id} type="button" role="tab" aria-selected={on} className="btn" onClick={() => set({ tab: id })}
                style={{ padding: '11px 14px', borderRadius: 10, fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', background: on ? C.line : 'transparent', color: on ? '#fff' : C.muted }}>
                {t(`dash.tab.${id}`)}
              </button>
            );
          })}
        </nav>
        <button type="button" className="btn account-signout" onClick={signOut}>
          {t('dash.signOut')}
        </button>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>
        {s.tab === 'overview' && <Overview data={data} />}
        {s.tab === 'alerts' && <Alerts data={data} />}
        {s.tab === 'locations' && <Locations />}
        {s.tab === 'plans' && <Plans embedded />}
        {s.tab === 'account' && <AccountSettings />}
      </div>
    </main>
  );
}

function usePlanLine() {
  const { s, plan, planIndex, live } = useStore();
  const { profile, trialExpired } = useAuth();
  const { t, money, date } = useI18n();
  const price = (annual: boolean) => (annual ? t('dash.perYear', { price: money(plan.y) }) : t('dash.perMonth', { price: money(plan.m) }));
  if (live) {
    if (planIndex === 0) return trialExpired ? t('dash.trialEnded') : t('dash.freeLine');
    const sub = profile?.subscriptionStatus;
    if (sub && profile?.currentPeriodEnd) {
      const when = date(profile.currentPeriodEnd, { month: 'short', day: 'numeric', year: 'numeric' });
      const state = sub === 'past_due' ? t('dash.pastDue')
        : profile.cancelAtPeriodEnd ? t('dash.endsOn', { date: when })
        : sub === 'trialing' ? t('dash.trialEnds', { date: when })
        : t('dash.renewsOn', { date: when });
      return `${price(profile.billingCycle === 'annual')} · ${state}`;
    }
    const trial = profile?.trialEndsAt ? ` · ${t('dash.trialEnds', { date: date(profile.trialEndsAt, { month: 'short', day: 'numeric', year: 'numeric' }) })}` : '';
    return price(profile?.billingCycle === 'annual') + trial;
  }
  return planIndex === 0 ? t('dash.freeLine') : `${price(s.annual)} · ${t('dash.trial14')}`;
}

const h2 = { fontSize: 'clamp(28px, 7.5vw, 34px)', lineHeight: 1 };
const h1 = { fontSize: 'clamp(40px, 11vw, 56px)', lineHeight: .9 };

const DAY = 864e5;
/**
 * Plain-language read of a forecast night: how bright and active the aurora should be (from Kp)
 * and where it sits in the user's sky (from how far Kp clears their location's threshold).
 */
function nightOutlook(kp: number, need: number, south: boolean, moonLit: number, t: I18n['t']): { label: string; text: string } {
  const level = kp >= 7 ? 'strong' : kp >= 6 ? 'moderate' : kp >= 5 ? 'minor' : kp >= 4 ? 'active' : kp >= 3 ? 'unsettled' : 'quiet';
  const label = t(`night.label.${level}`);
  const side = south ? 'south' : 'north';
  const margin = kp - need;
  if (margin < 0) return { label, text: t(`night.miss.${side}`) };
  const where: MessageKey = margin < 1 ? `night.where.low.${side}` : margin < 3 ? `night.where.across.${side}` : 'night.where.overhead';
  const parts = [t('night.sentence', { look: t(`night.look.${level}`), where: t(where) })];
  if (margin < 1) parts.push(t('night.camera'));
  if (moonLit >= 0.6) parts.push(t('night.moon'));
  return { label, text: parts.join(' ') };
}

/** Home location (loaded on demand) and the Kp it needs, defaulting to Kp 5 when none is saved. */
function useHome() {
  const { locations, load } = useLocations();
  useEffect(() => { load(); }, [load]);
  const home = locations.find(l => l.isHome) ?? null;
  return { home, locations, need: home ? kpNeeded(home.lat, home.lon) : 5, count: locations.length };
}

function Overview({ data }: { data: AccountData }) {
  const { set, plan, planIndex, go } = useStore();
  const { t, num, date } = useI18n();
  const shortDate = (d: number) => date(d, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const weekday = (d: number) => date(d, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const planLine = usePlanLine();
  const { home, need, count } = useHome();
  const days = data.days;
  const strongest = days.reduce<typeof days[number] | null>((m, d) => (!m || d.kpMax > m.kpMax ? d : m), null);
  const nights = days.filter(d => d.kpMax >= need).length;
  const kp = data.kp?.kp ?? null;
  const stats = [
    { label: t('dash.stat.kpNow'), value: kp === null ? '—' : `Kp ${num(kp, 1)}`, note: kp === null ? t('home.h.unavailable') : G_SCALE(kp) ? t('dash.gStorm', { g: G_SCALE(kp) }) : kpName(t, kp), c: kp !== null && kp >= 5 ? C.red : C.soft },
    { label: t('dash.stat.days', { need }), value: days.length ? String(nights) : '—', note: t('dash.lastDays', { n: days.length || 90 }), c: C.green },
    { label: t('dash.stat.strongest'), value: strongest ? `Kp ${num(strongest.kpMax, 1)}` : '—', note: strongest ? `${shortDate(strongest.t)}${G_SCALE(strongest.kpMax) ? ` · G${G_SCALE(strongest.kpMax)}` : ''}` : t('common.noData'), c: C.red },
    { label: t('dash.stat.saved'), value: String(count), note: home ? t('dash.homeIs', { place: home.name }) : t('dash.noHome'), c: C.soft },
  ];

  // Twelve 7-day buckets ending today.
  const end = Math.floor(data.fetchedAt / DAY) * DAY + DAY;
  const weeks = [...Array(12)].map((_, i) => {
    const from = end - (12 - i) * 7 * DAY;
    const inWeek = days.filter(d => d.t >= from && d.t < from + 7 * DAY);
    return { from, kp: inWeek.length ? Math.max(...inWeek.map(d => d.kpMax)) : null };
  });
  const w = 860 / 12;
  const visY = 210 - need * 20;

  return (
    <div data-screen-label="Dashboard · Overview" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px,100%),1fr))', gap: 20 }}>
        <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(20px, 5vw, 28px)', border: `1px solid ${plan.accent}`, borderRadius: 18, background: 'var(--panel)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', right: -90, bottom: -150, width: 340, height: 340, borderRadius: '50%', border: `38px solid ${plan.accent}`, opacity: .45, filter: 'blur(30px)' }} />
          <span className="mono" style={{ position: 'relative', fontSize: 12, letterSpacing: '.08em', color: 'var(--muted)' }}>{t('plans.kicker')}</span>
          <span className="display" style={{ position: 'relative', fontSize: 'clamp(34px,4.2vw,60px)', lineHeight: .9, overflowWrap: 'anywhere', color: plan.accent }}>{t(`tier.${plan.id}`)}</span>
          <span style={{ position: 'relative', fontSize: 16, color: 'var(--soft)' }}>{planLine}</span>
          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
            <button type="button" className="btn pill pill-primary" onClick={() => go('plans')} style={{ fontSize: 14, padding: '11px 18px' }}>{planIndex === TIERS.length - 1 ? t('dash.changePlan') : t('dash.upgrade')}</button>
            <button type="button" className="btn pill pill-ghost" onClick={() => set({ tab: 'account' })} style={{ fontSize: 14, padding: '11px 18px', background: '#000' }}>{t('dash.billing')}</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
          {stats.map(st => (
            <div key={st.label} style={{ background: '#000', padding: 18, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span className="label">{st.label}</span>
              <span className="stat-value" style={{ fontSize: 30, whiteSpace: 'nowrap' }}>{st.value}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: st.c, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.note}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <h2 className="display" style={h2}>{t('dash.season.h2a')} <span className="hl">{t('dash.season.h2b')}</span></h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 13, color: 'var(--soft)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 11, height: 11, background: C.darkGreen }} />{t('dash.season.weekly')}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, borderTop: `2px dashed ${C.amber}` }} />{home ? t('dash.season.visibleFrom', { place: home.name, need }) : t('dash.season.typical', { need })}</span>
          </div>
        </div>
        <div className="hscroll"><svg viewBox="0 0 900 240" style={{ width: '100%', minWidth: 560, display: 'block' }} role="img" aria-label={t('dash.season.aria')}>
          {[0, 3, 6, 9].map(k => (
            <g key={k}>
              <line x1="30" x2="890" y1={210 - k * 20} y2={210 - k * 20} style={{ stroke: '#fff', strokeOpacity: .07 }} />
              <text x="20" y={214 - k * 20} style={{ fill: C.muted, font: "10px 'JetBrains Mono'", textAnchor: 'end' }}>{k}</text>
            </g>
          ))}
          <line x1="30" x2="890" y1={visY} y2={visY} style={{ stroke: C.amber, strokeWidth: 1.5, strokeDasharray: '6 4' }} />
          {weeks.map((wk, i) => {
            const x = 30 + i * w;
            return (
              <g key={wk.from}>
                {wk.kp !== null && <rect x={f(x + 10)} y={f(210 - wk.kp * 20)} width={f(w - 20)} height={f(wk.kp * 20)} style={{ fill: kpColor(wk.kp) }}><title>{t('dash.season.week', { date: shortDate(wk.from), kp: num(wk.kp, 2) })}</title></rect>}
                <text x={f(x + w / 2)} y="230" style={{ fill: C.soft, font: "600 11px 'Barlow'", textAnchor: 'middle' }}>{shortDate(wk.from)}</text>
              </g>
            );
          })}
          <line x1="30" x2="890" y1="210" y2="210" style={{ stroke: C.muted }} />
          {days.length === 0 && <text x="460" y="120" style={{ fill: C.muted, font: "600 14px 'Barlow'", textAnchor: 'middle' }}>{t('dash.historyUnavailable')}</text>}
        </svg></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <h2 className="display" style={h2}>{t('dash.best.h2a')} <span className="hl">{t('dash.best.h2b')}</span></h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('dash.best.source')}</span>
        </div>
        {(() => {
          const best = [...data.outlook].sort((a, b) => b.kp - a.kp || a.t - b.t).slice(0, 5).sort((a, b) => a.t - b.t);
          if (!best.length) return <span style={{ fontSize: 15, color: 'var(--muted)', padding: '12px 0' }}>{t('dash.best.unavailable')}</span>;
          return best.map(u => {
            const c = kpBarColor(u.kp);
            return (
              <div key={u.t} className="night">
                <span style={{ fontWeight: 700, fontSize: 16 }}>{weekday(u.t)}</span>
                <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 20, color: c }}>Kp {u.kp}</span>
                <div className="night-bar" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ height: 10, background: '#121512', borderRadius: 2 }}>
                    <div style={{ height: 10, width: `${(u.kp / 9) * 100}%`, background: c, borderRadius: 2, boxShadow: `0 0 12px ${c}` }} />
                  </div>
                  {(() => {
                    const lit = moon(u.t + 864e5, 0, 0).illumination;
                    const o = nightOutlook(u.kp, need, (home?.lat ?? 1) < 0, lit, t);
                    return (
                      <>
                        <span style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--soft)' }}><b style={{ color: c }}>{o.label}.</b> {o.text}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{home ? t('dash.best.needAt', { need, place: home.name.split(',')[0] }) : t('dash.best.need', { need })} · {t('dash.best.moon', { pct: Math.round(lit * 100) })} · {t('dash.best.flux', { flux: u.flux })}</span>
                      </>
                    );
                  })()}
                </div>
                <span className="mono" style={{ fontSize: 14, textAlign: 'right' }}>Ap {u.ap}</span>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

interface ToggleProps { label: string; sub: string; on: boolean; need: number; locked: boolean; onClick: () => void }

/** Settings row with a switch. Rows above the user's plan are dimmed, labelled with the required tier, and link to Plans. */
function ToggleRow({ label, sub, on, need, locked, onClick }: ToggleProps) {
  const { t } = useI18n();
  const tier = t(`tier.${TIERS[need].id}`);
  const active = on && !locked;
  return (
    <button type="button" className="btn toggle-row" onClick={onClick} style={{ opacity: locked ? .55 : 1 }}
      role={locked ? undefined : 'switch'} aria-checked={locked ? undefined : active}
      aria-label={locked ? t('dash.requires', { label, plan: tier }) : undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{sub}</span>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: TIERS[need].accent, whiteSpace: 'nowrap' }}>{locked ? tier.toUpperCase() : ''}</span>
      <span className={'switch' + (active ? ' on' : '')}><span className="switch-knob" /></span>
    </button>
  );
}

function Alerts({ data }: { data: AccountData }) {
  const { s, set, planIndex, go, live } = useStore();
  const { user } = useAuth();
  const { t, tn, num, date, locale } = useI18n();
  const shortDate = (d: number) => date(d, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  // Email alerts go to the address the account signed up with.
  const accountEmail = live ? user?.email ?? t('dash.accountEmail') : 'sam@example.com';
  const chaser = planIndex >= 1;
  const r = s.alertRules;
  const setRules = (patch: Partial<AlertRules>) => patchRules(set, patch);
  // The history chart beside the levels: days whose highest Kp would have reached the chosen level at
  // Home on a clear, dark night (the alerts themselves also weigh darkness, cloud and the Moon).
  const { home, need } = useHome();
  const kp = Math.round(levelKp(r.level, need) * 10) / 10;
  const last30 = data.days.slice(-30);
  const hits = last30.filter(d => d.kpMax >= kp).length;
  const thY = f(170 - kp * 17);
  const bw = 450 / Math.max(30, last30.length);
  const soon = (sub: string) => `${sub} · ${t('alerts.comingSoon')}`;
  return (
    <div data-screen-label="Dashboard · Alerts" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <h1 className="display" style={h1}>{t('alerts.h1a')} <span className="hl">{t('alerts.h1b')}</span></h1>
      <AlertStatus />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow" style={{ marginBottom: 8 }}>{t('alerts.quick')}</span>
          <ToggleRow label={t('alerts.storm')} sub={t('alerts.storm.sub')} need={0} locked={false} on={r.storm} onClick={() => setRules({ storm: !r.storm })} />
          <label className="alert-kp" aria-disabled={!r.storm}>
            <span>{t('alerts.stormKp')}</span>
            <select value={kp} disabled={!r.storm} onChange={e => set({ kpThreshold: +e.target.value })}>
              {[5, 6, 7, 8, 9].map(k => <option key={k} value={k}>{`Kp ${k}+ · ${kpName(t, k)}`}</option>)}
            </select>
          </label>
          <ToggleRow label={t('alerts.forecast')} sub={t('alerts.forecast.sub')} need={1} locked={!chaser} on={r.forecast}
            onClick={!chaser ? () => go('plans') : () => setRules({ forecast: !r.forecast })} />
          <ToggleRow label={t('alerts.quiet')} sub={t('alerts.quietSub')} need={0} locked={false} on={r.quiet} onClick={() => setRules({ quiet: !r.quiet })} />
          <div className="alert-quiet" aria-disabled={!r.quiet}>
            <label><span>{t('alerts.quiet.from')}</span><input type="time" value={r.quietFrom} disabled={!r.quiet} onChange={e => setRules({ quietFrom: e.target.value || r.quietFrom })} /></label>
            <label><span>{t('alerts.quiet.to')}</span><input type="time" value={r.quietTo} disabled={!r.quiet} onChange={e => setRules({ quietTo: e.target.value || r.quietTo })} /></label>
          </div>
        </div>
        <RecentAlerts />
      </div>

      <div className="alert-rule">
        <fieldset className="alert-levels" disabled={!r.aurora}>
          <legend>{t('alerts.level.h')}</legend>
          {ALERT_LEVELS.map(l => (
            <label key={l} className={'alert-level alert-level-' + l}>
              <input type="radio" name="alert-level" checked={r.level === l} onChange={() => setRules({ level: l })} />
              <span><b>{t(`alerts.level.${l}`)}</b><small>{t(`alerts.level.${l}.sub`)}</small></span>
            </label>
          ))}
        </fieldset>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>{t('alerts.last30')}</span>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 22, whiteSpace: 'nowrap' }}><span className="hl">{hits}</span> {tn('alerts.levelDays', hits, { level: t(`alerts.level.${r.level}`).toLocaleLowerCase(locale) })}</span>
          </div>
          <svg viewBox="0 0 450 190" style={{ width: '100%', display: 'block' }} role="img" aria-label={t('alerts.levelAria', { hits, days: last30.length, level: t(`alerts.level.${r.level}`).toLocaleLowerCase(locale) })}>
            <line x1="0" x2="450" y1={thY} y2={thY} style={{ stroke: C.green, strokeWidth: 1.5, strokeDasharray: '5 4' }} />
            {last30.map((d, i) => (
              <rect key={d.t} x={f(i * bw)} y={f(170 - d.kpMax * 17)} width={f(bw - 4)} height={f(d.kpMax * 17)} style={{ fill: d.kpMax >= kp ? C.green : C.line2 }}>
                <title>{t('alerts.dayTitle', { date: shortDate(d.t), kp: num(d.kpMax, 2) })}</title>
              </rect>
            ))}
            <line x1="0" x2="450" y1="170" y2="170" style={{ stroke: C.muted }} />
            {last30.length > 0 && <text x="0" y="186" style={{ fill: C.muted, font: "10px 'JetBrains Mono'" }}>{shortDate(last30[0].t).toUpperCase()}</text>}
            <text x="450" y="186" style={{ fill: C.muted, font: "10px 'JetBrains Mono'", textAnchor: 'end' }}>{t('alerts.today')}</text>
            {last30.length === 0 && <text x="225" y="90" style={{ fill: C.muted, font: "600 13px 'Barlow'", textAnchor: 'middle' }}>{t('dash.historyUnavailable')}</text>}
          </svg>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {home ? t('alerts.levelNote', { place: home.name.split(',')[0], need, level: t(`alerts.level.${r.level}`), kp: num(kp, 1) })
              : t('alerts.levelNoteNoHome', { need, level: t(`alerts.level.${r.level}`), kp: num(kp, 1) })}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow" style={{ marginBottom: 8 }}>{t('alerts.deliver')}</span>
          {CHANNEL_DEFS.map(([k, need]) => {
            const locked = planIndex < need;
            if (k === 'push') return <PushRow key={k} need={need} locked={locked} />;
            return <ToggleRow key={k} label={t(`channel.${k}`)} sub={k === 'email' ? accountEmail : soon(t(`channel.${k}.sub`))} need={need} locked={locked} on={s.channels[k]}
              onClick={locked ? () => go('plans') : () => set(st => ({ channels: { ...st.channels, [k]: !st.channels[k] } }))} />;
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow" style={{ marginBottom: 8 }}>{t('alerts.moreTypes')}</span>
          {TRIGGER_DEFS.filter(([k]) => k === 'bz' || k === 'sub').map(([k, need]) => {
            const locked = planIndex < need;
            return <ToggleRow key={k} label={t(`trigger.${k}`)} sub={soon(t(`trigger.${k}.sub`))} need={need} locked={locked} on={s.triggers[k]}
              onClick={locked ? () => go('plans') : () => set(st => ({ triggers: { ...st.triggers, [k]: !st.triggers[k] } }))} />;
          })}
        </div>
      </div>
    </div>
  );
}

/** Whether aurora alerts are on, where they watch, the level they wait for and how they arrive. */
function AlertStatus() {
  const { s, set, planIndex, go } = useStore();
  const { t } = useI18n();
  const { home, locations } = useHome();
  const r = s.alertRules;
  const chaser = planIndex >= 1;
  // Free alerts watch the home location; Chaser watches every saved location.
  const watched = chaser ? [...locations].sort((a, b) => +b.isHome - +a.isHome) : home ? [home] : [];
  const names = watched.slice(0, 3).map(l => l.name.split(',')[0]).join(' · ');
  const places = watched.length > 3 ? `${names} ${t('alerts.status.more', { n: watched.length - 3 })}` : names;
  const channels = CHANNEL_DEFS.filter(([k, need]) => k !== 'sms' && planIndex >= need && s.channels[k]).map(([k]) => t(`channel.${k}`));
  const on = r.aurora && watched.length > 0;
  return (
    <section className={'alert-status' + (on ? ' on' : '')} aria-label={t('alerts.aurora')}>
      <ToggleRow label={t(on ? 'alerts.status.on' : 'alerts.status.off')} need={0} locked={false} on={r.aurora}
        sub={watched.length ? t(chaser ? 'alerts.aurora.sub' : 'alerts.aurora.subFree', { place: home?.name.split(',')[0] ?? '' }) : t('alerts.aurora.noHome')}
        onClick={() => patchRules(set, { aurora: !r.aurora })} />
      <dl className="alert-status-facts">
        <div>
          <dt>{t('alerts.status.places')}</dt>
          <dd>{watched.length ? places : <button type="button" className="btn hl" onClick={() => go('account', { tab: 'locations' })}>{t('alerts.status.addHome')}</button>}</dd>
        </div>
        <div><dt>{t('alerts.status.level')}</dt><dd>{t(`alerts.level.${r.level}`)}</dd></div>
        <div><dt>{t('alerts.status.via')}</dt><dd>{channels.length ? channels.join(' · ') : t('alerts.status.noChannel')}</dd></div>
      </dl>
    </section>
  );
}

const patchRules = (set: ReturnType<typeof useStore>['set'], patch: Partial<AlertRules>) =>
  set(st => ({ alertRules: { ...st.alertRules, ...patch } }));

interface LogRow { id: number; kind: AlertKind; level: AlertLevel | null; score: number | null; kp: number | null; place: string | null; created_at: string }

/** The last alerts the engine sent this account (alert_log; read-own under RLS). */
function RecentAlerts() {
  const { live } = useStore();
  const { user } = useAuth();
  const { t, num, date } = useI18n();
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const userId = user?.id;
  useEffect(() => {
    const sb = live && userId ? supabase() : null;
    if (!sb) { setRows([]); return; }
    let stale = false;
    sb.from('alert_log').select('id,kind,level,score,kp,place,created_at').order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => { if (!stale) setRows((data as LogRow[] | null) ?? []); });
    return () => { stale = true; };
  }, [live, userId]);
  const when = (iso: string) => date(Date.parse(iso), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const title = (a: LogRow) => {
    const place = (a.place ?? '').split(',')[0];
    if (a.kind === 'storm') return t('alerts.recent.storm', { kp: num(a.kp ?? 0, 1) });
    const level = t(`alerts.level.${a.level ?? 'visible'}`);
    return t(a.kind === 'forecast' ? 'alerts.recent.forecast' : 'alerts.recent.aurora', { level, place });
  };
  return (
    <section className="alert-recent" aria-labelledby="alert-recent-h">
      <span id="alert-recent-h" className="eyebrow" style={{ marginBottom: 8 }}>{t('alerts.recent.h')}</span>
      {rows === null ? null : rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>{t('alerts.recent.none')}</p>
      ) : (
        <ol>
          {rows.map(a => (
            <li key={a.id} className={'alert-recent-' + a.kind}>
              <span className="alert-recent-dot" aria-hidden="true" />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <b>{title(a)}</b>
                <small>{when(a.created_at)}</small>
              </span>
              {a.kind !== 'storm' && a.score != null && <span className="mono alert-recent-score">{a.score}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** /alerts: the phone Alerts tab. Signed in, the alert settings; signed out, what alerts do and how to get them. */
export function AlertsPage({ data }: { data: AccountData }) {
  const { signedIn, live } = useStore();
  const auth = useAuth();
  const { t } = useI18n();
  if (live && !auth.ready) return <main className="wrap" style={{ padding: '64px var(--gutter)', color: 'var(--muted)' }}>{t('dash.loading')}</main>;
  return (
    <main data-screen-label="Alerts" className="wrap alerts-page">
      {signedIn ? <Alerts data={data} /> : <AlertsIntro />}
    </main>
  );
}

function AlertsIntro() {
  const { go } = useStore();
  const router = useRouter();
  const { t } = useI18n();
  const points: [string, MessageKey][] = [['email', 'alerts.intro.1'], ['push', 'alerts.intro.2'], ['storm', 'alerts.intro.3']];
  return (
    <div className="alerts-intro">
      <h1 className="display" style={h1}>{t('alerts.intro.h1a')} <span className="hl">{t('alerts.intro.h1b')}</span></h1>
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.45, color: 'var(--soft)' }}>{t('alerts.intro.body')}</p>
      <ul>
        {points.map(([id, key]) => <li key={id}><span className="alert-recent-dot" aria-hidden="true" />{t(key)}</li>)}
      </ul>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" className="btn pill pill-primary" onClick={() => router.push('/signin?mode=signup&next=/alerts')}>{t('alerts.intro.cta')}</button>
        <button type="button" className="btn pill pill-ghost" onClick={() => go('plans')}>{t('alerts.intro.plans')}</button>
      </div>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
        {t('alerts.intro.have')} <button type="button" className="btn hl" style={{ fontWeight: 700 }} onClick={() => router.push('/signin?next=/alerts')}>{t('nav.signIn')}</button>
      </p>
    </div>
  );
}

/**
 * Push for this device: subscribing needs a tap (permission prompt), and iPhones only allow it once
 * Polar Lights is on the home screen, so that case opens the install steps instead.
 */
function PushRow({ need, locked }: { need: number; locked: boolean }) {
  const { set, go } = useStore();
  const { t } = useI18n();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  const sub = err || (state === null ? t('channel.push.sub')
    : state === 'unconfigured' ? `${t('channel.push.sub')} · ${t('alerts.comingSoon')}`
    : state === 'on' ? t('push.sub.on') : state === 'off' ? t('channel.push.sub') : t(`push.sub.${state === 'needs-install' ? 'needsInstall' : state}`));
  const toggle = async () => {
    if (locked) return go('plans');
    if (state === 'needs-install') return window.dispatchEvent(new Event(INSTALL_EVENT));
    if (state !== 'on' && state !== 'off') return;
    setBusy(true); setErr('');
    try {
      const next = state === 'on' ? await disablePush() : await enablePush();
      setState(next);
      set(st => ({ channels: { ...st.channels, push: next === 'on' } }));
    } catch {
      setErr(t('push.error'));
    } finally {
      setBusy(false);
    }
  };
  return <ToggleRow label={t('channel.push')} sub={sub} need={need} locked={locked} on={state === 'on' && !busy} onClick={toggle} />;
}

const hhmmUT = (t: number) => `${new Date(t).toISOString().slice(11, 16)} UT`;
const coords = (l: { lat: number; lon: number }, { t, num }: I18n) =>
  `${num(Math.abs(l.lat), 2)}°${t(l.lat >= 0 ? 'dir.N' : 'dir.S')} ${num(Math.abs(l.lon), 2)}°${t(l.lon >= 0 ? 'dir.E' : 'dir.W')}`;

function LocationCard({ loc, paused, index }: { loc: SavedLocation; paused: boolean; index: number }) {
  const { setHome, remove } = useLocations();
  const { data: cond, loading } = useConditions(loc.lat, loc.lon);
  const i18n = useI18n();
  const { t } = i18n;
  const aur = cond?.aurora?.nearby ?? null;
  const tag = t(paused ? 'loc.tag.paused' : loc.isHome ? 'sky.tag.home' : loc.source === 'device' ? 'loc.tag.device' : 'loc.tag.saved');
  const tagC = paused ? C.muted : loc.isHome ? C.green : loc.source === 'device' ? '#9CFF6E' : C.soft;
  const ac = aur === null ? C.soft : aur >= 30 ? C.green : aur >= 10 ? C.amber : C.soft;
  const mono10 = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--muted)' };
  const big = { fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 24 };
  const glow = aur ?? 0;
  const sun = cond?.sun;
  const darkLine = !sun ? (loading ? t('loc.checking') : t('loc.unavailable'))
    : sun.dark ? (sun.changesAt ? t('loc.darkUntil', { time: hhmmUT(sun.changesAt) }) : t('loc.darkNow'))
    : sun.changesAt ? t('loc.darkFrom', { time: hhmmUT(sun.changesAt) }) : t('loc.midnightSun');
  const linkBtn = { fontSize: 13, fontWeight: 700, color: 'var(--muted)' };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20, opacity: paused ? .45 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 18, overflowWrap: 'anywhere' }}>{loc.name}</span>
          <span className="label">{coords(loc, i18n)}</span>
        </div>
        <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 999, border: `1px solid ${tagC}`, color: tagC }}>{tag}</span>
      </div>
      <svg viewBox="0 0 240 90" style={{ width: '100%', display: 'block', borderRadius: 10, background: '#050806' }} aria-hidden="true">
        <defs><filter id={`lb${index}`} x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="9" /></filter></defs>
        <ellipse cx="120" cy="72" rx="110" ry={f(8 + glow * .45)} style={{ fill: '#59FF3A', opacity: f(Math.min(.9, .08 + glow / 70)), filter: `url(#lb${index})` }} />
        <line x1="0" x2="240" y1="72" y2="72" style={{ stroke: '#fff' }} />
        <rect x="0" y="72" width="240" height="18" style={{ fill: '#000' }} />
        <text x="120" y="86" style={{ fill: C.muted, font: "700 10px 'Barlow'", textAnchor: 'middle' }}>{t(loc.lat >= 0 ? 'dir.N' : 'dir.S')}</text>
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={mono10}>{t('sky.stat.aurora')}</span><span style={{ ...big, color: ac }}>{aur === null ? '—' : `${aur}%`}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={mono10}>{t('sky.stat.cloud')}</span><span style={big}>{cond?.cloud ? `${cond.cloud.aurora}%` : '—'}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={mono10}>{t('sky.stat.needs')}</span><span style={big}>Kp {cond?.kpNeeded ?? kpNeeded(loc.lat, loc.lon)}</span></div>
      </div>
      <span style={{ fontSize: 13, color: sun?.dark ? C.green : 'var(--muted)', fontWeight: 600 }}>{darkLine}</span>
      {cond?.cloud && (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {t('sky.cloud.layers', { ...cond.cloud.layers })}{cond.satellite ? ` · ${t('loc.satLine', { pct: cond.satellite.pct })}` : ''}
        </span>
      )}
      <div style={{ display: 'flex', gap: 16, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        {!loc.isHome && <button type="button" className="btn" style={linkBtn} onClick={() => setHome(loc.id)}>{t('loc.makeHome')}</button>}
        <button type="button" className="btn" style={{ ...linkBtn, color: C.red }} onClick={() => remove(loc.id)}>{t('loc.remove')}</button>
      </div>
    </div>
  );
}

function AddLocation({ disabled }: { disabled: boolean }) {
  const { plan, go } = useStore();
  const { add, detectDevice, detecting } = useLocations();
  const { t, tn } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (disabled) {
    return (
      <button type="button" className="btn" onClick={() => go('plans')}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 240, padding: 20, border: '1px dashed var(--line-3)', borderRadius: 16, textAlign: 'center' }}>
        <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 40, color: 'var(--green)', lineHeight: 1 }}>+</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{t('loc.add')}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('loc.planIncludes', { plan: t(`tier.${plan.id}`), locs: tn('sky.locs', plan.locs) })}</span>
      </button>
    );
  }
  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try { const r = await searchPlaces(q); setResults(r); if (!r.length) setMsg(t('search.none')); }
    catch { setMsg(t('search.unavailable')); }
    finally { setBusy(false); }
  };
  const pick = async (r: PlaceResult) => {
    const saved = await add({ name: r.detail ? `${r.name}, ${r.detail.split(', ')[0]}` : r.name, lat: r.lat, lon: r.lon, source: 'manual' });
    if (saved) { setQ(''); setResults(null); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 240, padding: 20, border: '1px dashed var(--line-3)', borderRadius: 16 }}>
      <span style={{ fontWeight: 700, fontSize: 16 }}>{t('loc.add')}</span>
      <button type="button" className="btn pill pill-primary" disabled={detecting} onClick={async () => { setMsg(null); if (!(await detectDevice())) setMsg(null); }}
        style={{ fontSize: 14, padding: '11px 16px', opacity: detecting ? .6 : 1 }}>
        {detecting ? t('loc.finding') : t('loc.useCurrent')}
      </button>
      <form onSubmit={search} style={{ display: 'flex', gap: 8 }}>
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} style={{ padding: 11 }} />
        <button type="submit" className="btn pill pill-ghost" disabled={busy || q.trim().length < 2} style={{ fontSize: 14, padding: '0 16px', flex: 'none' }}>{busy ? '…' : t('search.button')}</button>
      </form>
      {results && results.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {results.map(r => (
            <li key={`${r.lat},${r.lon}`}>
              <button type="button" className="btn" onClick={() => pick(r)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ fontWeight: 700 }}>{r.name}</span><span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{msg}</span>}
    </div>
  );
}

function Locations() {
  const { plan, live } = useStore();
  const { locations, status, load, backend, error, detectDevice } = useLocations();
  const { t } = useI18n();
  useEffect(() => {
    load();
    // If location access was granted before, refresh the device location without prompting.
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then(p => { if (p.state === 'granted') detectDevice({ silent: true }); })
      .catch(() => {});
  }, [load, detectDevice]);
  const limit = plan.locs;
  const active = Math.min(locations.length, limit);
  return (
    <div data-screen-label="Dashboard · Locations" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <h1 className="display" style={h1}>{t('loc.h1a')} <span className="hl">{t('loc.h1b')}</span></h1>
        <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>{t('loc.active', { n: active, limit: limit > 10 ? '∞' : limit })}</span>
      </div>
      {error && <span role="status" style={{ fontSize: 14, color: C.amber }}>{error}</span>}
      {backend === 'local' && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{live ? t('loc.browserLive') : t('loc.browser')}</span>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(260px,100%),1fr))', gap: 16 }}>
        {status !== 'ready' && <span style={{ color: 'var(--muted)' }}>{t('loc.loading')}</span>}
        {locations.map((l, i) => <LocationCard key={l.id} loc={l} index={i} paused={i >= limit} />)}
        <AddLocation disabled={locations.length >= limit} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--dim)' }}>{t('loc.footnote')}</span>
    </div>
  );
}

/** Language picker: saved to the account (so it follows the user to other devices) and to this browser. */
function Language() {
  const { live } = useStore();
  const { user, saveLocale } = useAuth();
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const change = async (next: string) => {
    if (!isLocale(next) || next === locale) return;
    setBusy(true);
    if (live && user) await saveLocale(next);
    applyLocale(next);
  };
  return (
    <section aria-labelledby="language-h" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 id="language-h" className="display" style={h2}>{t('lang.h2')}</h2>
      <span style={{ fontSize: 14, color: 'var(--soft)' }}>{t('lang.body')}</span>
      <select className="input" aria-labelledby="language-h" value={locale} disabled={busy} onChange={e => change(e.target.value)}
        style={{ maxWidth: 320, padding: 12, fontSize: 16, fontWeight: 600, opacity: busy ? .6 : 1 }}>
        {LOCALES.map(l => <option key={l} value={l} lang={l}>{LOCALE_NAMES[l]}</option>)}
      </select>
    </section>
  );
}

function Billing() {
  const { s, plan, planIndex, go, cancelPlan, openBilling, live } = useStore();
  const { profile } = useAuth();
  const { t, money } = useI18n();
  const [opening, setOpening] = useState(false);
  const planName = t(`tier.${plan.id}`);
  const planLine = usePlanLine();
  const annual = live ? profile?.billingCycle === 'annual' : s.annual;
  const stripeCustomer = live && PAYMENTS && !!profile?.hasBilling;
  return (
    <section aria-labelledby="billing-h" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 id="billing-h" className="display" style={h2}>{t('dash.billing')}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: 16 }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 22 }}>
          <span className="label">{t('billing.plan')}</span>
          <span style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: 32, color: plan.accent }}>{planName}</span>
          <span style={{ fontSize: 14, color: 'var(--soft)' }}>{planLine}</span>
          <button type="button" className="btn" onClick={() => go('plans')} style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)', marginTop: 6, alignSelf: 'flex-start' }}>
            {planIndex === TIERS.length - 1 ? t('dash.changePlan') : t('dash.upgrade')} →
          </button>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 22 }}>
          <span className="label">{t('billing.payment')}</span>
          {stripeCustomer ? (
            <>
              <span style={{ fontWeight: 700, fontSize: 18 }}>{t('billing.stripe')}</span>
              {profile?.subscriptionStatus === 'past_due' && <span role="status" style={{ fontSize: 14, fontWeight: 600, color: C.amber }}>{t('billing.pastDue')}</span>}
              <span style={{ fontSize: 14, color: 'var(--soft)' }}>{t('billing.manageBody')}</span>
              <button type="button" className="btn" disabled={opening} onClick={async () => { setOpening(true); await openBilling(); setOpening(false); }}
                style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)', marginTop: 6, alignSelf: 'flex-start', opacity: opening ? .6 : 1 }}>
                {opening ? t('common.oneMoment') : `${t('billing.manage')} →`}
              </button>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 700, fontSize: 18 }}>{t('billing.noMethod')}</span>
              <span style={{ fontSize: 14, color: 'var(--soft)' }}>
                {!planIndex ? t('billing.freeNever')
                  : live && PAYMENTS ? t('billing.noCardNeeded')
                  : t('billing.after', { plan: planName, price: annual ? t('billing.aYear', { price: money(plan.y) }) : t('billing.aMonth', { price: money(plan.m) }) })}
              </span>
            </>
          )}
        </div>
      </div>
      {planIndex > 0 && (
        <button type="button" className="btn" onClick={cancelPlan} style={{ alignSelf: 'flex-start', fontWeight: 600, fontSize: 14, color: C.red }}>{t('billing.cancel')}</button>
      )}
    </section>
  );
}

/** Dashboard → Account: profile, billing, password and sign-out. */
function AccountSettings() {
  const { live, signOut } = useStore();
  const auth = useAuth();
  const { t } = useI18n();
  const name = live ? auth.profile?.displayName || auth.user?.email?.split('@')[0] || '—' : 'Sam Rivera';
  const email = live ? auth.user?.email ?? '—' : 'sam@example.com';
  return (
    <div data-screen-label="Dashboard · Account" style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <h1 className="display" style={h1}>{t('dash.tab.account')}</h1>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 16, padding: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="label">{t('field.name')}</span>
          <span style={{ fontWeight: 700, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="label">{t('field.email')}</span>
          <span style={{ fontWeight: 700, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
        </div>
      </div>
      <Language />
      <Billing />
      <ChangePassword email={email} />
      <section aria-labelledby="signout-h" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 24 }}>
        <h2 id="signout-h" className="display" style={h2}>{t('logout.h2a')} <span className="hl">{t('logout.h2b')}</span></h2>
        <span style={{ fontSize: 14, color: 'var(--soft)' }}>{t('logout.body')}</span>
        <button type="button" className="btn pill pill-ghost" onClick={signOut} style={{ alignSelf: 'flex-start', fontSize: 15, padding: '12px 22px', color: C.red, borderColor: C.red }}>{t('logout.button')}</button>
      </section>
    </div>
  );
}

/** Change password: confirms the current password first, then sets the new one. */
function ChangePassword({ email }: { email: string }) {
  const { live } = useStore();
  const { signIn, updatePassword } = useAuth();
  const { t, tx } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next !== again) { setMsg({ ok: false, text: t('pw.mismatch') }); return; }
    if (next === current) { setMsg({ ok: false, text: t('err.samePassword') }); return; }
    setBusy(true);
    if (live) {
      const check = await signIn(email, current);
      if (check.error) { setBusy(false); setMsg({ ok: false, text: t('pw.wrongCurrent') }); return; }
      const r = await updatePassword(next);
      setBusy(false);
      if (r.error) { setMsg({ ok: false, text: tx(r.error) }); return; }
    } else setBusy(false);
    setCurrent(''); setNext(''); setAgain('');
    setMsg({ ok: true, text: live ? t('pw.changed') : t('pw.changedDemo') });
  };
  return (
    <section aria-labelledby="password-h" style={{ display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid var(--line)', paddingTop: 24 }}>
      <h2 id="password-h" className="display" style={h2}>{t('pw.h2a')} <span className="hl">{t('pw.h2b')}</span></h2>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
        {/* Hidden username helps password managers update the right entry. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Field label={t('field.currentPassword')} type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} />
        <Field label={t('field.newPassword')} type="password" autoComplete="new-password" required minLength={8} value={next} onChange={e => setNext(e.target.value)} />
        <Field label={t('field.confirmPassword')} type="password" autoComplete="new-password" required minLength={8} value={again} onChange={e => setAgain(e.target.value)} />
        <span style={{ fontSize: 13, color: 'var(--muted)', marginTop: -4 }}>{t('pw.rule')}</span>
        {msg && <span role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 14, color: msg.ok ? C.green : C.red }}>{msg.text}</span>}
        <button type="submit" disabled={busy} className="btn pill pill-primary" style={{ alignSelf: 'flex-start', fontSize: 15, padding: '13px 22px', opacity: busy ? .6 : 1 }}>{busy ? t('common.saving') : t('pw.button')}</button>
      </form>
    </section>
  );
}
