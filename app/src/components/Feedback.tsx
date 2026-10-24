'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { inApp } from '../lib/native';
import { useI18n } from '../i18n/I18n';

type Kind = 'issue' | 'idea' | 'other';
const KINDS: Kind[] = ['issue', 'idea', 'other'];
/** Same limits as /api/feedback. */
const MIN = 5, MAX = 4000;

/**
 * Report an issue or request a feature: sent to /api/feedback, which saves it and emails the admins (who
 * can reply to the member). `onSent` lets a sheet close itself.
 */
export function FeedbackForm({ onSent }: { onSent?: () => void }) {
  const { t, locale } = useI18n();
  const [kind, setKind] = useState<Kind>('issue');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error' | 'limit'>('idle');

  const send = async () => {
    if (message.trim().length < MIN || state === 'sending') return;
    setState('sending');
    try {
      const sb = supabase();
      const token = sb ? (await sb.auth.getSession()).data.session?.access_token : null;
      if (!token) { setState('error'); return; }
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, message: message.trim(), context: { where: inApp() ? 'android app' : 'website', language: locale, device: navigator.userAgent } }),
      });
      if (res.ok) { setState('sent'); setMessage(''); onSent?.(); }
      else setState(res.status === 429 ? 'limit' : 'error');
    } catch {
      setState('error');
    }
  };

  if (state === 'sent' && !onSent) {
    return (
      <div className="feedback-done" role="status">
        <b>{t('feedback.thanks')}</b>
        <span>{t('feedback.thanksBody')}</span>
        <button type="button" className="btn gal-link" onClick={() => setState('idle')}>{t('feedback.another')}</button>
      </div>
    );
  }
  return (
    <div className="feedback">
      <div className="gal-chips" role="radiogroup" aria-label={t('feedback.kind')}>
        {KINDS.map(k => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={'btn gal-filter' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>
            {t(`feedback.kind.${k}`)}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="label">{t(`feedback.prompt.${kind}`)}</span>
        <textarea className="input" rows={5} maxLength={MAX} value={message} placeholder={t(`feedback.hint.${kind}`)}
          onChange={e => { setMessage(e.target.value); if (state !== 'sending') setState('idle'); }} />
      </label>
      <p className="gal-note">{t('feedback.note')}</p>
      {(state === 'error' || state === 'limit') && <p className="gal-note" role="alert" style={{ color: 'var(--red)' }}>{t(state === 'limit' ? 'feedback.limit' : 'feedback.failed')}</p>}
      <button type="button" className="btn pill pill-primary sheet-pill" disabled={message.trim().length < MIN || state === 'sending'} onClick={send}>
        {state === 'sending' ? t('feedback.sending') : t('feedback.send')}
      </button>
    </div>
  );
}
