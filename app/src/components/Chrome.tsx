'use client';

import { initials, useAuth } from '../lib/auth';
import { useStore, type Screen } from '../store';
import { SITE } from '../lib/site';

const NAV: [string, Screen][] = [['Now', 'home'], ['Map', 'map'], ['Dashboard', 'account']];

export function Header({ kpLabel }: { kpLabel: string }) {
  const { signedIn, live, screen: current, plan, go, goAccount } = useStore();
  const { user, profile } = useAuth();
  const avatar = live ? initials(profile?.displayName, user?.email) : 'SR';
  return (
    <header className="header">
      <div className="wrap header-inner">
        <div className="header-left">
          <button type="button" className="btn brand" onClick={() => go('home')} aria-label={`${SITE.name} home`}>
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
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="header-right">
          <span className="mono header-kp" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{kpLabel}</span>
          {signedIn ? (
            <button type="button" className="btn header-account" onClick={goAccount} aria-label={`Dashboard, ${plan.name} plan`}>
              <span className="header-plan">{plan.name}</span>
              <span className="avatar" style={{ width: 32, height: 32, fontSize: 13 }}>{avatar}</span>
            </button>
          ) : (
            <>
              <button type="button" className="btn header-signin" onClick={() => go('signin')}>Sign in</button>
              <button type="button" className="btn pill pill-primary header-cta" onClick={() => go('plans')} style={{ fontSize: 14, padding: '10px 18px' }}>Get alerts</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function Toast() {
  const { s, set } = useStore();
  if (!s.toast) return null;
  return (
    <div className="wrap" style={{ margin: '16px auto 0', padding: '0 var(--gutter)' }}>
      <div role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '14px 18px', border: '1px solid var(--green)', borderRadius: 12, background: 'rgba(108,255,43,.08)' }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{s.toast}</span>
        <button type="button" className="btn mono" onClick={() => set({ toast: '' })} style={{ fontSize: 12, color: 'var(--muted)' }}>DISMISS</button>
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="rule-top">
      <div className="wrap" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px var(--gutter)', fontSize: 12, color: 'var(--dim)' }}>
        <span>Data: NOAA SWPC, GFZ Potsdam, NASA/SDO. Times in UT.</span>
        <span style={{ color: 'var(--green)', fontWeight: 700 }}>{SITE.domain}</span>
      </div>
    </footer>
  );
}
