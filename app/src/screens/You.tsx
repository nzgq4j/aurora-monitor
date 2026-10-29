'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { initials, useAuth } from '../lib/auth';
import { TIERS } from '../data';
import { useStore } from '../store';
import { useLocations } from '../lib/locations';
import { feed, myMember } from '../lib/community';
import { rank } from '../lib/badges';
import { SITE } from '../lib/site';
import { useI18n } from '../i18n/I18n';
import { applyLocale } from '../i18n/I18n';
import { LOCALES, LOCALE_NAMES } from '../i18n/config';
import { useNightMode, type NightSetting } from '../components/NightMode';
import { FeedbackForm } from '../components/Feedback';
import { replayIntro } from '../components/Onboarding';
import { BottomSheet } from '../components/BottomSheet';
import { Plans } from './Plans';
import { Billing, ChangePassword, Locations, useAccountDeletion } from './Account';
import type { MessageKey } from '../i18n/core';
import { nativePlugin } from '../lib/native';

/** The website build on screen: the first 7 characters of its git commit ('dev' locally). */
const WEB_BUILD = (process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev').slice(0, 7);

/**
 * The You tab: the phone's Dashboard, laid out like an app's settings screen. A profile card, then
 * grouped rows that open their own screens (with a back arrow; the URL hash keeps Back working) or a
 * sheet from the bottom. Signed out, it offers sign-in and keeps the settings that work without an account.
 */

type View = '' | 'locations' | 'plans' | 'billing' | 'password';
const VIEWS: View[] = ['locations', 'plans', 'billing', 'password'];
const TITLES: Record<Exclude<View, ''>, MessageKey> = { locations: 'you.locations', plans: 'dash.tab.plans', billing: 'you.plan', password: 'you.password' };
type Sheet = null | 'language' | 'night' | 'logout' | 'delete' | 'feedback';

const readView = (): View => {
  const v = window.location.hash.slice(1) as View;
  return VIEWS.includes(v) ? v : '';
};

const P = {
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 5l-7 7 7 7',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  photo: 'M4 6h16v13H4zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM20 16l-5-5-8 8',
  chat: 'M5 5h14v10H10l-4 4v-4H5z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-2.5 6.5a2.5 2.5 0 1 1 3.8 2.1c-.8.5-1.3 1-1.3 1.9M12 16.5v.01',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Zm4 4.5a2.2 2.2 0 0 0 4 0',
  card: 'M3 6h18v13H3zM3 10h18M7 15h4',
  lock: 'M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  badge: 'M12 3l7 2.5v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9v-6L12 3Z',
};
const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** One row of a group: an icon, a label, an optional value and a chevron when it opens something. */
function Row({ icon, label, value, onClick, href, danger, chevron = true }: {
  icon?: string; label: string; value?: ReactNode; onClick?: () => void; href?: string; danger?: boolean; chevron?: boolean;
}) {
  const body = (
    <>
      {icon && <Icon d={icon} />}
      <span className="you-row-label">{label}</span>
      {value !== undefined && <span className="you-row-value">{value}</span>}
      {chevron && (onClick || href) && <span className="you-chevron"><Icon d={P.chevron} size={16} /></span>}
    </>
  );
  const cls = 'you-row' + (danger ? ' danger' : '');
  if (href) return <a className={cls} href={href}>{body}</a>;
  if (onClick) return <button type="button" className={'btn ' + cls} onClick={onClick}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="you-group" aria-label={label}>
      <h2 className="you-group-label">{label}</h2>
      <div className="you-group-rows">{children}</div>
    </section>
  );
}

export function You() {
  const store = useStore();
  const { s, set, go, live, signedIn, plan, planIndex, signOut } = store;
  const auth = useAuth();
  const router = useRouter();
  const { t, locale } = useI18n();
  const night = useNightMode();
  const { locations, load } = useLocations();
  const [view, setView] = useState<View>('');
  // In the Android app: its version and build number (versionName and versionCode), shown with the site's build.
  const [appVersion, setAppVersion] = useState<string | null>(null);
  useEffect(() => {
    nativePlugin<{ getInfo: () => Promise<{ version: string; build: string }> }>('App')?.getInfo()
      .then(i => setAppVersion(`${i.version} (${i.build})`)).catch(() => {});
  }, []);
  const [sheet, setSheet] = useState<Sheet>(null);
  // Photos this member has posted to the community gallery (pending ones included); a page holds at most 60.
  const [posted, setPosted] = useState<number | null>(null);
  const [langBusy, setLangBusy] = useState(false);
  const [points, setPoints] = useState<number | null>(null);
  const deletion = useAccountDeletion();
  // Screens this tab pushed onto the history, so its back arrow can step back instead of leaving.
  const depth = useRef(0);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (auth.user) void myMember().then(m => setPoints(m?.points ?? null)); }, [auth.user]);
  useEffect(() => { if (auth.user) void feed('mine', { limit: 60 }).then(r => setPosted(r?.length ?? null)); }, [auth.user]);
  useEffect(() => {
    const sync = () => { const v = readView(); if (!v) depth.current = 0; setView(v); setSheet(null); };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const open = useCallback((v: Exclude<View, ''>) => {
    window.history.pushState(null, '', `#${v}`);
    depth.current++;
    setView(v);
    window.scrollTo(0, 0);
  }, []);
  const back = () => {
    if (depth.current > 0) { depth.current--; window.history.back(); return; }
    window.history.replaceState(null, '', window.location.pathname);
    setView('');
  };

  // Links elsewhere still ask for a Dashboard tab (Upgrade → plans, the Alerts tab's Locations link …).
  useEffect(() => {
    if (s.tab === 'overview') return;
    const tab = s.tab;
    set({ tab: 'overview' });
    if (tab === 'plans' || tab === 'locations') open(tab);
    else if (tab === 'alerts') go('alerts');
  }, [s.tab, set, go, open]);

  if (live && !auth.ready) return <main className="you" aria-busy="true" />;

  const user = auth.user;
  const name = live ? auth.profile?.displayName || user?.email?.split('@')[0] || t('dash.yourAccount') : 'Sam Rivera';
  const email = live ? user?.email ?? '' : 'sam@example.com';
  // Google accounts have no password to change.
  const hasPassword = !live || !!(user?.app_metadata?.providers as string[] | undefined)?.includes('email');
  const top = planIndex === TIERS.length - 1;

  if (view) {
    return (
      <main className="you you-sub" data-screen-label={`You · ${view}`}>
        <div className="you-bar">
          <button type="button" className="btn you-back" onClick={back} aria-label={t('you.back')}><Icon d={P.back} size={24} /></button>
          <h1 className="you-bar-title">{t(TITLES[view])}</h1>
        </div>
        <div className="you-sub-body">
          {view === 'locations' && <Locations bare />}
          {view === 'plans' && <Plans embedded />}
          {view === 'billing' && <Billing bare />}
          {view === 'password' && <ChangePassword email={email} bare />}
        </div>
      </main>
    );
  }

  const close = () => { setSheet(null); deletion.clear(); };
  const pickLocale = async (next: (typeof LOCALES)[number]) => {
    if (next === locale) { close(); return; }
    setLangBusy(true);
    if (live && user) await auth.saveLocale(next);
    applyLocale(next);
  };

  return (
    <main className="you" data-screen-label="You">
      <h1 className="you-title">{t('nav.you')}</h1>

      {signedIn ? (
        <div className="you-profile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="avatar you-avatar">{live ? initials(auth.profile?.displayName, email) : 'SR'}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
              <span className="you-name">{name}</span>
              <span className="you-email">{email}</span>
            </div>
            <span className="you-badge" style={{ color: plan.accent, borderColor: plan.accent }}>{t(`tier.${plan.id}`)}</span>
          </div>
          {!top && (
            <button type="button" className="btn pill pill-primary you-cta" onClick={() => open('plans')}>
              {t('you.upgrade', { plan: t(`tier.${TIERS[planIndex + 1].id}`) })}
            </button>
          )}
        </div>
      ) : (
        <div className="you-profile">
          <span className="you-name">{t('you.guest.title')}</span>
          <span style={{ fontSize: 15, color: 'var(--soft)' }}>{t('you.guest.body')}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn pill pill-primary you-cta" style={{ flex: 1 }} onClick={() => go('signin')}>{t('nav.signIn')}</button>
            <button type="button" className="btn pill pill-ghost you-cta" style={{ flex: 1 }} onClick={() => router.push('/signin?mode=signup')}>{t('you.guest.create')}</button>
          </div>
        </div>
      )}

      <Group label={t('you.group.aurora')}>
        <Row icon={P.pin} label={t('you.locations')} value={String(locations.length)} onClick={() => open('locations')} />
        <Row icon={P.bell} label={t('nav.alerts')} onClick={() => go('alerts')} />
        {signedIn && <Row icon={P.badge} label={t('badges.title')} value={points === null ? '' : t(`rank.${rank(points).id}` as MessageKey)} onClick={() => go('badges')} />}
        {signedIn && <Row icon={P.photo} label={t('you.myGallery')} value={posted === null ? '' : posted >= 60 ? '60+' : String(posted)} href="/gallery?f=mine" />}
      </Group>

      <Group label={t('you.group.settings')}>
        <Row icon={P.globe} label={t('lang.h2')} value={LOCALE_NAMES[locale]} onClick={() => setSheet('language')} />
        <Row icon={P.moon} label={t('night.title')} value={t(`night.${night.setting}`)} onClick={() => setSheet('night')} />
      </Group>

      {signedIn && (
        <>
          <Group label={t('you.group.membership')}>
            <Row icon={P.card} label={t('you.plan')} value={t(`tier.${plan.id}`)} onClick={() => open('billing')} />
          </Group>
          <Group label={t('you.group.account')}>
            {hasPassword && <Row icon={P.lock} label={t('you.password')} onClick={() => open('password')} />}
            <Row icon={P.logout} label={t('logout.button')} danger chevron={false} onClick={() => setSheet('logout')} />
          </Group>
        </>
      )}

      <Group label={t('you.group.support')}>
        <Row icon={P.help} label={t('support.title')} href="/support" />
        <Row icon={P.spark} label={t('intro.replay')} onClick={() => { replayIntro(); go('home'); }} />
        {signedIn && <Row icon={P.chat} label={t('feedback.row')} onClick={() => setSheet('feedback')} />}
      </Group>

      <Group label={t('you.group.about')}>
        <Row label={t('title.privacy')} href="/privacy" />
        <Row label={t('title.terms')} href="/terms" />
        <Row label={t('you.sources')} value="NOAA · GFZ · NASA" />
        <Row label={t('you.version')} value={appVersion ? `${appVersion} · ${WEB_BUILD}` : `${t('you.versionWeb')} ${WEB_BUILD}`} />
        {signedIn && <Row label={t('footer.deleteAccount')} danger chevron={false} onClick={() => setSheet('delete')} />}
      </Group>
      <p className="you-foot mono">{SITE.name} · {SITE.domain}</p>

      {sheet === 'language' && (
        <BottomSheet title={t('lang.h2')} onClose={close}>
          <div className="you-group-rows" aria-busy={langBusy}>
            {LOCALES.map(l => (
              <button key={l} type="button" className="btn you-row" lang={l} disabled={langBusy} aria-pressed={l === locale} onClick={() => pickLocale(l)}>
                <span className="you-row-label">{LOCALE_NAMES[l]}</span>
                {l === locale && <span style={{ color: 'var(--green)' }}><Icon d={P.check} /></span>}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {sheet === 'night' && (
        <BottomSheet title={t('night.title')} onClose={close}>
          <span className="you-sheet-text">{t('you.nightBody')}</span>
          <div className="you-group-rows">
            {(['off', 'on', 'auto'] as NightSetting[]).map(m => (
              <button key={m} type="button" className="btn you-row" aria-pressed={m === night.setting} onClick={() => { night.set(m); close(); }}>
                <span className="you-row-label">{t(`night.${m}`)}</span>
                {m === night.setting && <span style={{ color: 'var(--green)' }}><Icon d={P.check} /></span>}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {sheet === 'logout' && (
        <BottomSheet title={t('you.logoutQ')} onClose={close}>
          <span className="you-sheet-text">{t('logout.body')}</span>
          <button type="button" className="btn pill pill-ghost you-cta you-danger" onClick={() => { close(); signOut(); }}>{t('logout.button')}</button>
          <button type="button" className="btn pill pill-ghost you-cta" onClick={close}>{t('common.cancel')}</button>
        </BottomSheet>
      )}

      {sheet === 'delete' && (
        <BottomSheet title={t('delete.confirm')} onClose={close}>
          <span className="you-sheet-text">{t('delete.body')}</span>
          <span className="you-sheet-text">{t('delete.confirmBody')}</span>
          {deletion.err && <span role="alert" style={{ fontSize: 14, color: 'var(--red)' }}>{deletion.err}</span>}
          <button type="button" className="btn pill you-cta you-danger-fill" disabled={deletion.busy} onClick={async () => { if (await deletion.run()) close(); }}>
            {deletion.busy ? t('delete.deleting') : t('delete.yes')}
          </button>
          <button type="button" className="btn pill pill-ghost you-cta" disabled={deletion.busy} onClick={close}>{t('delete.no')}</button>
        </BottomSheet>
      )}

      {sheet === 'feedback' && (
        <BottomSheet title={t('feedback.title')} onClose={close}>
          <FeedbackForm onSent={() => { close(); set({ toast: t('feedback.thanks') }); }} />
        </BottomSheet>
      )}
    </main>
  );
}
