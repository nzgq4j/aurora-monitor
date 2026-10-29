'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { devicePlace, searchPlaces, useLocations, type Place, type PlaceResult } from '../lib/locations';
import { ALERT_LEVELS } from '../lib/alerts';
import { useStore } from '../store';
import { PushRow, ToggleRow } from './AlertControls';
import { useI18n } from '../i18n/I18n';
import { headLead } from '../i18n/core';

/**
 * 'done' once finished or skipped; 'again' when replayed from You → Support (shows even with saved places);
 * 'alerts' while someone creates an account from the alerts step, so the introduction picks up there afterwards.
 */
export const INTRO_KEY = 'pl.intro';
const read = () => { try { return localStorage.getItem(INTRO_KEY); } catch { return 'done'; } };
const write = (v: string) => { try { localStorage.setItem(INTRO_KEY, v); } catch { /* storage unavailable */ } };

/** Shows the introduction again on the Now page (You → Support). */
export const replayIntro = () => write('again');

const STEPS = ['welcome', 'place', 'read', 'alerts', 'done'] as const;
type Step = (typeof STEPS)[number];

/**
 * First-run introduction on the Now page (#213): welcome, set Home, how to read the Tonight card, alerts, done.
 * Shown once per device to people with no saved places, after sign-in has settled so returning members on a
 * new device don't see it. Every step can be skipped; full screen on phones, a dialog on wider screens.
 */
export function Onboarding() {
  const { ready } = useAuth();
  const { locations, status } = useLocations();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('welcome');

  useEffect(() => {
    if (!ready || (status !== 'ready' && status !== 'error')) return;
    const flag = read();
    const resume = flag === 'alerts';
    if (!resume && flag !== 'again' && (flag === 'done' || locations.length > 0)) return;
    // Just after the Now page has drawn, so it's there behind the dialog.
    const id = setTimeout(() => { if (resume) setStep('alerts'); setOpen(true); }, 0);
    return () => clearTimeout(id);
  }, [ready, status]); // eslint-disable-line react-hooks/exhaustive-deps -- decided once, when locations have loaded

  const close = useCallback(() => { write('done'); setOpen(false); }, []);
  if (!open) return null;
  const i = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(i + 1, STEPS.length - 1)]);
  return <IntroDialog step={step} index={i} next={next} back={() => setStep(STEPS[Math.max(i - 1, 0)])} close={close} />;
}

function IntroDialog({ step, index, next, back, close }: { step: Step; index: number; next: () => void; back: () => void; close: () => void }) {
  const { t } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  // Each step's heading takes focus, so screen readers announce it; Escape skips the introduction.
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('intro-open');
    return () => { document.removeEventListener('keydown', onKey); document.documentElement.classList.remove('intro-open'); };
  }, [close]);
  return (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-h">
      <div className="intro-box">
        <div className="intro-top">
          {index > 0 && step !== 'done' ? <button type="button" className="btn intro-link" onClick={back}>{t('intro.back')}</button> : <span />}
          <ol className="intro-dots" aria-label={t('intro.progress', { n: index + 1, of: STEPS.length })}>
            {STEPS.map((s, k) => <li key={s} className={k <= index ? 'on' : ''} />)}
          </ol>
          {step !== 'done' ? <button type="button" className="btn intro-link" onClick={close}>{t('intro.skip')}</button> : <span />}
        </div>
        {step === 'welcome' && <Welcome heading={heading} next={next} />}
        {step === 'place' && <PlaceStep heading={heading} next={next} />}
        {step === 'read' && <ReadStep heading={heading} next={next} />}
        {step === 'alerts' && <AlertsStep heading={heading} next={next} />}
        {step === 'done' && <Done heading={heading} close={close} />}
      </div>
    </div>
  );
}

type Heading = { heading: React.RefObject<HTMLHeadingElement | null> };
const H = ({ heading, children }: Heading & { children: React.ReactNode }) => (
  <h2 id="intro-h" ref={heading} tabIndex={-1} className="display intro-h">{children}</h2>
);

function Welcome({ heading, next }: Heading & { next: () => void }) {
  const { t } = useI18n();
  return (
    <div className="intro-step">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="intro-mark" src="/icons/icon-512.png" alt="" width={120} height={120} />
      <H heading={heading}>{headLead(t('intro.welcome.h1a'))}<span className="hl">{t('intro.welcome.h1b')}</span></H>
      <p className="intro-text">{t('intro.welcome.body')}</p>
      <button type="button" className="btn pill pill-primary intro-go" onClick={next}>{t('intro.start')}</button>
    </div>
  );
}

function PlaceStep({ heading, next }: Heading & { next: () => void }) {
  const { t, tx } = useI18n();
  const { plan } = useStore();
  const { locations, saveAsHome, error } = useLocations();
  const home = locations.find(l => l.isHome);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState<'device' | 'search' | 'save' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async (p: Place, source: 'manual' | 'device') => {
    setBusy('save'); setMsg(null);
    const saved = await saveAsHome({ ...p, source }, plan.locs);
    setBusy(null);
    if (saved) next();
  };
  const useDevice = async () => {
    setBusy('device'); setMsg(null);
    try { const p = await devicePlace(); setBusy(null); await save(p, 'device'); }
    catch (e) { setBusy(null); setMsg(tx((e as Error).message)); }
  };
  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('search'); setMsg(null);
    try { const r = await searchPlaces(q); setResults(r); if (!r.length) setMsg(t('search.none')); }
    catch { setMsg(t('search.unavailable')); }
    finally { setBusy(null); }
  };

  return (
    <div className="intro-step">
      <H heading={heading}>{t('intro.place.h')}</H>
      <p className="intro-text">{t('intro.place.body')}</p>
      {home && <p className="intro-note">{t('intro.place.current', { place: home.name.split(',')[0] })}</p>}
      <button type="button" className="btn pill pill-primary intro-go" disabled={!!busy} onClick={useDevice}>
        {busy === 'device' ? t('loc.finding') : t('loc.useCurrent')}
      </button>
      <span className="intro-or">{t('common.or')}</span>
      <form onSubmit={search} className="intro-search">
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} />
        <button type="submit" className="btn pill pill-ghost" disabled={!!busy || q.trim().length < 2}>{busy === 'search' ? '…' : t('search.button')}</button>
      </form>
      {results && results.length > 0 && (
        <ul className="intro-results">
          {results.map(r => (
            <li key={`${r.lat},${r.lon}`}>
              <button type="button" className="btn" disabled={!!busy}
                onClick={() => save({ name: r.detail ? `${r.name}, ${r.detail.split(', ')[0]}` : r.name, lat: r.lat, lon: r.lon }, 'manual')}>
                <b>{r.name}</b><span>{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(msg || error) && <p className="intro-note warn" role="status">{msg || error}</p>}
      <button type="button" className="btn intro-link" onClick={next}>{home ? t('intro.keep') : t('intro.skipStep')}</button>
    </div>
  );
}

function ReadStep({ heading, next }: Heading & { next: () => void }) {
  const { t, locale } = useI18n();
  const points = ['verdict', 'reason', 'window', 'hours'] as const;
  return (
    <div className="intro-step">
      <H heading={heading}>{t('intro.read.h')}</H>
      <div className="intro-read">
        {/* The help centre's picture of the Tonight card, in this language. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/support/shots/${locale}/tonight-card.webp`} alt="" width={360} height={420} />
        <ol>
          {points.map(p => <li key={p}><b>{t(`intro.read.${p}`)}</b> {t(`intro.read.${p}.body`)}</li>)}
        </ol>
      </div>
      <button type="button" className="btn pill pill-primary intro-go" onClick={next}>{t('intro.next')}</button>
    </div>
  );
}

/**
 * Alerts without leaving the introduction: aurora alerts on or off, the level to wait for, major storms and how they
 * arrive. Saved as they change (the store syncs alert settings for signed-in members); the full settings stay in
 * You → Aurora → Alerts. Signed out, creating an account comes back here afterwards.
 */
function AlertsStep({ heading, next }: Heading & { next: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { s, set, planIndex } = useStore();
  const { shownPlace } = useLocations();
  const router = useRouter();
  const r = s.alertRules;
  const rules = (patch: Partial<typeof r>) => set(st => ({ alertRules: { ...st.alertRules, ...patch } }));

  if (!user) return (
    <div className="intro-step">
      <H heading={heading}>{t('intro.alerts.h')}</H>
      <p className="intro-text">{t('intro.alerts.body')}</p>
      <ul className="intro-points">
        {(['alerts.intro.1', 'alerts.intro.2', 'alerts.intro.3'] as const).map(k => <li key={k}>{t(k)}</li>)}
      </ul>
      <p className="intro-note">{t('intro.alerts.account')}</p>
      <button type="button" className="btn pill pill-primary intro-go" onClick={() => { write('alerts'); router.push('/signin?mode=signup&next=/'); }}>{t('alerts.intro.cta')}</button>
      <button type="button" className="btn intro-link" onClick={next}>{t('intro.notNow')}</button>
    </div>
  );

  return (
    <div className="intro-step">
      <H heading={heading}>{t('intro.alerts.h')}</H>
      <div className="intro-alerts">
        <ToggleRow label={t('alerts.aurora')} need={0} locked={false} on={r.aurora} onClick={() => rules({ aurora: !r.aurora })}
          sub={shownPlace ? t('intro.alerts.where', { place: shownPlace.name.split(',')[0] }) : t('alerts.aurora.noHome')} />
        <fieldset className="alert-levels" disabled={!r.aurora}>
          <legend>{t('alerts.level.h')}</legend>
          {ALERT_LEVELS.map(l => (
            <label key={l} className={'alert-level alert-level-' + l}>
              <input type="radio" name="intro-alert-level" checked={r.level === l} onChange={() => rules({ level: l })} />
              <span><b>{t(`alerts.level.${l}`)}</b><small>{t(`alerts.level.${l}.sub`)}</small></span>
            </label>
          ))}
        </fieldset>
        <ToggleRow label={t('alerts.storm')} sub={t('alerts.storm.sub')} need={0} locked={false} on={r.storm} onClick={() => rules({ storm: !r.storm })} />
        <ToggleRow label={t('channel.email')} sub={user.email ?? t('channel.email.sub')} need={0} locked={false} on={s.channels.email}
          onClick={() => set(st => ({ channels: { ...st.channels, email: !st.channels.email } }))} />
        {/* Push is a Chaser channel; Free members see it with the rest of the settings, not here. */}
        {planIndex >= 1 && <PushRow need={1} locked={false} />}
      </div>
      <p className="intro-note">{t('intro.alerts.more', { alerts: t('nav.alerts') })}</p>
      <button type="button" className="btn pill pill-primary intro-go" onClick={next}>{t('intro.next')}</button>
    </div>
  );
}

function Done({ heading, close }: Heading & { close: () => void }) {
  const { t } = useI18n();
  const { shownPlace } = useLocations();
  return (
    <div className="intro-step">
      <H heading={heading}>{t('intro.done.h')}</H>
      <p className="intro-text">{shownPlace ? t('intro.done.body', { place: shownPlace.name.split(',')[0] }) : t('intro.done.bodyNoPlace')}</p>
      <p className="intro-note">{t('intro.done.help')} <Link href="/support" onClick={close} className="hl">{t('support.title')}</Link></p>
      <button type="button" className="btn pill pill-primary intro-go" onClick={close}>{t('intro.done.go')}</button>
    </div>
  );
}

/** "Show the introduction again" on the help centre's front page (desktop has no You screen). */
export function ReplayIntroLink() {
  const { t } = useI18n();
  const { go } = useStore();
  return <button type="button" className="btn support-more" onClick={() => { replayIntro(); go('home'); }}>{t('intro.replay')}</button>;
}
