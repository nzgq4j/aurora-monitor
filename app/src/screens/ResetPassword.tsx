'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '../components/Field';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n/I18n';

/** Landing page for the password-reset email link (Supabase signs the user in from the link first). */
export function ResetPassword() {
  const { user, ready, updatePassword } = useAuth();
  const router = useRouter();
  const { t, tx } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await updatePassword(password);
    setBusy(false);
    if (r.error) setError(r.error); else router.replace('/dashboard');
  };
  return (
    <main style={{ minHeight: 'calc(100vh - 72px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 18, padding: '36px clamp(20px, 6vw, 32px)', border: '1px solid var(--line-2)', borderRadius: 20 }}>
        <h1 className="display" style={{ fontSize: 'clamp(36px, 11vw, 48px)', lineHeight: .9 }}>{t('reset.h1a')}<br /><span className="hl">{t('reset.h1b')}</span></h1>
        {ready && !user ? (
          <span style={{ fontSize: 15, color: 'var(--soft)' }}>{t('reset.expired')}</span>
        ) : (
          <>
            <Field label={t('field.newPassword')} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
            {error && <span role="alert" style={{ fontSize: 14, color: 'var(--red)' }}>{tx(error)}</span>}
            <button type="submit" disabled={busy || !user} className="btn pill pill-primary" style={{ fontSize: 16, padding: 15, opacity: busy || !user ? .6 : 1 }}>{busy ? t('common.saving') : t('reset.save')}</button>
          </>
        )}
      </form>
    </main>
  );
}
