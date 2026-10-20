'use client';

import { initials, useAuth } from '../lib/auth';
import { useStore, type Screen } from '../store';
import { SITE } from '../lib/site';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/core';

const NAV: [MessageKey, Screen][] = [['nav.now', 'home'], ['nav.map', 'map'], ['nav.dashboard', 'account']];

export function Header({ kpLabel }: { kpLabel: string }) {
  const { signedIn, live, screen: current, plan, go, goAccount } = useStore();
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const planName = t(`tier.${plan.id}`);
  const avatar = live ? initials(profile?.displayName, user?.email) : 'SR';
  return (
    <header className="header">
      <div className="wrap header-inner">
        <div className="header-left">
          <button type="button" className="btn brand" onClick={() => go('home')} aria-label={t('nav.home', { name: SITE.name })}>
            <span className="brand-dot" />
            {/* Stacks to two lines on phones so the header stays on one row. */}
            <span className="brand-name" aria-hidden="true"><span>Polar</span> <span className="hl">Lights</span></span>
          </button>
          <nav className="nav">
            {NAV.map(([label, screen]) => {
              // Plans and checkout live under the Dashboard.
              const on = current === screen || (screen === 'account' && (current === 'plans' || current === 'checkout'));
              return (
                <button key={screen} type="button" className={'btn nav-item' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined}
                  onClick={screen === 'account' ? goAccount : () => go(screen)}>
                  {t(label)}
                </button>
              );
            })}
            {/* Tablets (touch screens wider than the phone layout) get Sky view in the header. */}
            <button type="button" className={'btn nav-item nav-sky' + (current === 'sky' ? ' on' : '')} aria-current={current === 'sky' ? 'page' : undefined} onClick={() => go('sky')}>
              {t('nav.sky')}
            </button>
          </nav>
        </div>
        <div className="header-right">
          <span className="mono header-kp" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{kpLabel}</span>
          {signedIn ? (
            <button type="button" className="btn header-account" onClick={goAccount} aria-label={t('nav.dashboardPlan', { plan: planName })}>
              <span className="header-plan">{planName}</span>
              <span className="avatar" style={{ width: 32, height: 32, fontSize: 13 }}>{avatar}</span>
            </button>
          ) : (
            <>
              <button type="button" className="btn header-signin" onClick={() => go('signin')}>{t('nav.signIn')}</button>
              <button type="button" className="btn pill pill-primary header-cta" onClick={() => go('plans')} style={{ fontSize: 14, padding: '10px 18px' }}>{t('nav.getAlerts')}</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Tab-bar icons (24 px, stroked in the current colour). */
const ICONS: Record<string, string> = {
  now: 'M4 18c2-6 5-10 8-10s6 4 8 10M7 18c1.4-3.6 3-5.5 5-5.5s3.6 1.9 5 5.5M3 21h18',
  map: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  sky: 'M4 8h3l1.6-2.4h6.8L17 8h3v11H4zM12 16.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z',
  alerts: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Zm4 4.5a2.2 2.2 0 0 0 4 0',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8.5c.9-3.6 3.8-5.5 7.5-5.5s6.6 1.9 7.5 5.5',
};
const Icon = ({ id }: { id: string }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={ICONS[id]} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** App-style navigation along the bottom of phone screens, in place of the header (see globals.css). */
export function TabBar() {
  const { screen, go } = useStore();
  const { t } = useI18n();
  // You holds the account, plans, sign-in and settings.
  const you = screen === 'account' || screen === 'plans' || screen === 'checkout' || screen === 'signin';
  const tab = (id: string, label: string, on: boolean, onClick: () => void) => (
    <button key={id} type="button" className={`btn tabbar-item tab-${id}` + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} onClick={onClick}>
      <Icon id={id} /><span>{label}</span>
    </button>
  );
  return (
    <nav className="tabbar" aria-label={t('nav.main')}>
      {tab('now', t('nav.now'), screen === 'home', () => go('home'))}
      {tab('map', t('nav.map'), screen === 'map', () => go('map'))}
      {/* Sky view needs a camera and motion sensors: touch devices only (see globals.css). */}
      {tab('sky', t('nav.sky'), screen === 'sky', () => go('sky'))}
      {tab('alerts', t('nav.alerts'), screen === 'alerts', () => go('alerts'))}
      {tab('account', t('nav.you'), you, () => go('account', { tab: 'overview' }))}
    </nav>
  );
}

export function Toast() {
  const { s, set } = useStore();
  const { t } = useI18n();
  if (!s.toast) return null;
  return (
    <div className="wrap" style={{ margin: '16px auto 0', padding: '0 var(--gutter)' }}>
      <div role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '14px 18px', border: '1px solid var(--green)', borderRadius: 12, background: 'rgba(108,255,43,.08)' }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{s.toast}</span>
        <button type="button" className="btn mono" onClick={() => set({ toast: '' })} style={{ fontSize: 12, color: 'var(--muted)' }}>{t('common.dismiss')}</button>
      </div>
    </div>
  );
}

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="rule-top">
      <div className="wrap" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px var(--gutter)', fontSize: 12, color: 'var(--dim)' }}>
        <span>{t('footer.sources')}</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'baseline' }}>
          <a href="/privacy" style={{ color: 'var(--dim)' }}>{t('footer.privacy')}</a>
          <a href="/terms" style={{ color: 'var(--dim)' }}>{t('footer.terms')}</a>
          <a href="/delete-account" style={{ color: 'var(--dim)' }}>{t('footer.deleteAccount')}</a>
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>{SITE.domain}</span>
        </span>
      </div>
    </footer>
  );
}
