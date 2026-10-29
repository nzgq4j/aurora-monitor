'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n/I18n';
import { FeedbackForm } from './Feedback';

/** "Still need help?" at the end of help pages: the feedback form when signed in, else a way to sign in. */
export function SupportContact() {
  const { t } = useI18n();
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <section id="contact" className="support-contact" aria-labelledby="support-contact">
      <h2 id="support-contact">{t('support.contact')}</h2>
      {!ready ? null : user ? (
        open ? <FeedbackForm /> : (
          <>
            <p>{t('support.contactBody')}</p>
            <button type="button" className="btn pill pill-ghost" onClick={() => setOpen(true)}>{t('support.contactButton')}</button>
          </>
        )
      ) : (
        <>
          <p>{t('support.contactSignedOut')}</p>
          <Link href="/signin?next=/support%23contact" className="btn pill pill-ghost">{t('nav.signIn')}</Link>
        </>
      )}
    </section>
  );
}
