'use client';

import { useStore, type Screen } from '../store';

const NAV: [string, Screen][] = [['Now', 'home'], ['Plans', 'plans'], ['Account', 'account']];

export function Header({ kpLabel }: { kpLabel: string }) {
  const { s, screen: current, plan, go, goAccount } = useStore();
  return (
    <header className="header">
      <div className="wrap header-inner">
        <div className="header-left">
          <button type="button" className="btn brand" onClick={() => go('home')}>
            <span className="brand-dot" />OVAL
          </button>
          <nav className="nav">
            {NAV.map(([label, screen]) => {
              const on = current === screen || (screen === 'plans' && current === 'checkout');
              return (
                <button key={screen} type="button" className={'btn nav-item' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined}
                  onClick={screen === 'account' ? goAccount : () => go(screen)}>
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="mono" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{kpLabel}</span>
          {s.signedIn ? (
            <button type="button" className="btn" onClick={goAccount}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 4px 14px', border: '1px solid var(--line-2)', borderRadius: 999 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{plan.name}</span>
              <span className="avatar" style={{ width: 32, height: 32, fontSize: 13 }}>SR</span>
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => go('signin')} style={{ fontWeight: 600, fontSize: 15, color: 'var(--soft)' }}>Sign in</button>
              <button type="button" className="btn pill pill-primary" onClick={() => go('plans')} style={{ fontSize: 14, padding: '10px 18px' }}>Get alerts</button>
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
        <span style={{ color: 'var(--green)', fontWeight: 700 }}>oval.watch</span>
      </div>
    </footer>
  );
}
