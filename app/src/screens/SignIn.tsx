'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '../components/Field';
import { useAuth } from '../lib/auth';
import { useStore } from '../store';

type Mode = 'signin' | 'signup' | 'reset';

export function SignIn() {
  const { go, signIn: demoSignIn } = useStore();
  const auth = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Already signed in (or just signed in): continue to the account.
  useEffect(() => {
    if (!auth.configured || !auth.user) return;
    const next = new URLSearchParams(window.location.search).get('next');
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
  }, [auth.configured, auth.user, router]);

  const alt = { textAlign: 'center' as const, border: '1px solid var(--line-2)', padding: 12, borderRadius: 999, fontWeight: 600, fontSize: 14 };
  const link = { color: 'var(--green)', fontWeight: 700 };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.configured) { demoSignIn(); return; }
    setBusy(true); setError(null); setNotice(null);
    if (mode === 'signin') {
      const r = await auth.signIn(email, password);
      if (r.error) setError(r.error);
    } else if (mode === 'signup') {
      const r = await auth.signUp(email, password, name.trim());
      if (r.error) setError(r.error);
      else if (r.needsConfirmation) setNotice(`We sent a confirmation link to ${email}. Open it to finish creating your account.`);
    } else {
      const r = await auth.sendPasswordReset(email);
      if (r.error) setError(r.error); else setNotice(`If an account exists for ${email}, a reset link is on its way.`);
    }
    setBusy(false);
  };

  const provider = async (p: 'google' | 'apple') => {
    if (!auth.configured) { demoSignIn(); return; }
    setError(null);
    const r = await auth.signInWithProvider(p);
    if (r.error) setError(r.error);
  };

  const heading = mode === 'signup' ? ['Create', 'account'] : mode === 'reset' ? ['Reset', 'password'] : ['Welcome', 'back'];
  const switchTo = (m: Mode) => { setMode(m); setError(null); setNotice(null); };

  return (
    <main data-screen-label="Sign in" style={{ position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 72px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: '-62vh', width: '120vh', height: '120vh', transform: 'translateX(-50%)', borderRadius: '50%', border: '60px solid rgba(89,255,58,.55)', filter: 'blur(50px)' }} />
      <form onSubmit={submit}
        style={{ position: 'relative', width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 18, padding: '36px clamp(20px, 6vw, 32px)', background: 'rgba(0,0,0,.82)', border: '1px solid var(--line-2)', borderRadius: 20 }}>
        <h1 className="display" style={{ fontSize: 'clamp(40px, 12vw, 52px)', lineHeight: .9 }}>{heading[0]}<br /><span className="hl">{heading[1]}</span></h1>
        {mode === 'signup' && <Field label="NAME" placeholder="Your name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} />}
        <Field label="EMAIL" placeholder="you@example.com" type="email" autoComplete="email" required={auth.configured} value={email} onChange={e => setEmail(e.target.value)} />
        {mode !== 'reset' && (
          <Field label="PASSWORD" placeholder="••••••••" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required={auth.configured} minLength={auth.configured ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} />
        )}
        {error && <span role="alert" style={{ fontSize: 14, color: 'var(--red)' }}>{error}</span>}
        {notice && <span role="status" style={{ fontSize: 14, color: 'var(--green)' }}>{notice}</span>}
        <button type="submit" disabled={busy} className="btn pill pill-primary" style={{ fontSize: 16, padding: 15, opacity: busy ? .6 : 1 }}>
          {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
        </button>
        {mode !== 'reset' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button type="button" className="btn" onClick={() => provider('google')} style={alt}>Google</button>
            <button type="button" className="btn" onClick={() => provider('apple')} style={alt}>Apple</button>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
          {mode === 'signin' && auth.configured && <>
            <span>New here? <button type="button" className="btn" onClick={() => switchTo('signup')} style={link}>Create an account</button></span>
            <button type="button" className="btn" onClick={() => switchTo('reset')} style={{ fontWeight: 600 }}>Forgot your password?</button>
          </>}
          {mode !== 'signin' && <span>Have an account? <button type="button" className="btn" onClick={() => switchTo('signin')} style={link}>Sign in</button></span>}
          {!auth.configured && <span>New here? <button type="button" className="btn" onClick={() => go('plans')} style={link}>Pick a membership</button></span>}
        </div>
      </form>
    </main>
  );
}
