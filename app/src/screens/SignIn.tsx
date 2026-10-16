'use client';

import { useStore } from '../store';
import { Field } from '../components/Field';

export function SignIn() {
  const { go, signIn } = useStore();
  const alt = { textAlign: 'center' as const, border: '1px solid var(--line-2)', padding: 12, borderRadius: 999, fontWeight: 600, fontSize: 14 };
  return (
    <main data-screen-label="Sign in" style={{ position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 72px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: '-62vh', width: '120vh', height: '120vh', transform: 'translateX(-50%)', borderRadius: '50%', border: '60px solid rgba(89,255,58,.55)', filter: 'blur(50px)' }} />
      <form onSubmit={e => { e.preventDefault(); signIn(); }}
        style={{ position: 'relative', width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 18, padding: '36px 32px', background: 'rgba(0,0,0,.82)', border: '1px solid var(--line-2)', borderRadius: 20 }}>
        <h1 className="display" style={{ fontSize: 52, lineHeight: .9 }}>Welcome<br /><span className="hl">back</span></h1>
        <Field label="EMAIL" placeholder="you@example.com" type="email" autoComplete="email" />
        <Field label="PASSWORD" placeholder="••••••••" type="password" autoComplete="current-password" />
        <button type="submit" className="btn pill pill-primary" style={{ fontSize: 16, padding: 15 }}>Sign in</button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" className="btn" onClick={signIn} style={alt}>Google</button>
          <button type="button" className="btn" onClick={signIn} style={alt}>Apple</button>
        </div>
        <span style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
          New here? <button type="button" className="btn" onClick={() => go('plans')} style={{ color: 'var(--green)', fontWeight: 700 }}>Pick a membership</button>
        </span>
      </form>
    </main>
  );
}
