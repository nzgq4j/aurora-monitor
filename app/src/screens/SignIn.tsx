'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '../components/Field';
import { useAuth } from '../lib/auth';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';
import { inApp } from '../lib/native';

type Mode = 'signin' | 'signup' | 'reset';

/** The same-site page to continue to after signing in (?next=), if any. */
const nextPath = () => {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
};

export function SignIn() {
  const { go, signIn: demoSignIn } = useStore();
  const auth = useAuth();
  const router = useRouter();
  const { t, tx } = useI18n();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [app, setApp] = useState(false);
  useEffect(() => setApp(inApp()), []);

  // Links can open straight on account creation (?mode=signup), e.g. from Checkout.
  useEffect(() => { if (new URLSearchParams(window.location.search).get('mode') === 'signup') setMode('signup'); }, []);

  // Already signed in (or just signed in): continue to where the user was heading.
  useEffect(() => {
    if (!auth.configured || !auth.user) return;
    router.replace(nextPath() ?? '/dashboard');
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
      const r = await auth.signUp(email, password, name.trim(), nextPath() ?? '/dashboard');
      if (r.error) setError(r.error);
      else if (r.needsConfirmation) setNotice(t('signin.confirmSent', { email }));
    } else {
      const r = await auth.sendPasswordReset(email);
      if (r.error) setError(r.error); else setNotice(t('signin.resetSent', { email }));
    }
    setBusy(false);
  };

  const provider = async (p: 'google' | 'apple') => {
    if (!auth.configured) { demoSignIn(); return; }
    setError(null);
    const r = await auth.signInWithProvider(p);
    if (r.error) setError(r.error);
  };

  const heading = mode === 'signup' ? [t('signin.h.signupA'), t('signin.h.signupB')] : mode === 'reset' ? [t('signin.h.resetA'), t('signin.h.resetB')] : [t('signin.h.signinA'), t('signin.h.signinB')];
  const switchTo = (m: Mode) => { setMode(m); setError(null); setNotice(null); };

  return (
    <main data-screen-label="Sign in" style={{ position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 72px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: '-62vh', width: '120vh', height: '120vh', transform: 'translateX(-50%)', borderRadius: '50%', border: '60px solid rgba(89,255,58,.55)', filter: 'blur(50px)' }} />
      <form onSubmit={submit}
        style={{ position: 'relative', width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 18, padding: '36px clamp(20px, 6vw, 32px)', background: 'rgba(0,0,0,.82)', border: '1px solid var(--line-2)', borderRadius: 20 }}>
        <h1 className="display" style={{ fontSize: 'clamp(40px, 12vw, 52px)', lineHeight: .9 }}>{heading[0]}<br /><span className="hl">{heading[1]}</span></h1>
        {mode === 'signup' && <Field label={t('field.name')} placeholder={t('field.namePlaceholder')} autoComplete="name" value={name} onChange={e => setName(e.target.value)} />}
        <Field label={t('field.email')} placeholder={t('field.emailPlaceholder')} type="email" autoComplete="email" required={auth.configured} value={email} onChange={e => setEmail(e.target.value)} />
        {mode !== 'reset' && (
          <Field label={t('field.password')} placeholder="••••••••" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required={auth.configured} minLength={auth.configured ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} />
        )}
        {error && <span role="alert" style={{ fontSize: 14, color: 'var(--red)' }}>{tx(error)}</span>}
        {notice && <span role="status" style={{ fontSize: 14, color: 'var(--green)' }}>{notice}</span>}
        <button type="submit" disabled={busy} className="btn pill pill-primary" style={{ fontSize: 16, padding: 15, opacity: busy ? .6 : 1 }}>
          {busy ? t('common.oneMoment') : mode === 'signup' ? t('signin.create') : mode === 'reset' ? t('signin.sendReset') : t('nav.signIn')}
        </button>
        {mode !== 'reset' && (
          <div style={{ display: 'grid', gridTemplateColumns: app ? '1fr' : '1fr 1fr', gap: 10 }}>
            <button type="button" className="btn" onClick={() => provider('google')} style={alt}>Google</button>
            {/* Apple's sign-in page can't return to the Android app. */}
            {!app && <button type="button" className="btn" onClick={() => provider('apple')} style={alt}>Apple</button>}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
          {mode === 'signin' && auth.configured && <>
            <span>{t('signin.newHere')} <button type="button" className="btn" onClick={() => switchTo('signup')} style={link}>{t('signin.createLink')}</button></span>
            <button type="button" className="btn" onClick={() => switchTo('reset')} style={{ fontWeight: 600 }}>{t('signin.forgot')}</button>
          </>}
          {mode !== 'signin' && <span>{t('signin.haveAccount')} <button type="button" className="btn" onClick={() => switchTo('signin')} style={link}>{t('nav.signIn')}</button></span>}
          {!auth.configured && <span>{t('signin.newHere')} <button type="button" className="btn" onClick={() => go('plans')} style={link}>{t('signin.pickMembership')}</button></span>}
        </div>
      </form>
    </main>
  );
}
