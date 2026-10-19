'use client';

import { useEffect, useState } from 'react';
import { SkyView } from '../components/SkyView';
import { useStore } from '../store';
import { useI18n } from '../i18n/I18n';

/** Phones and small tablets: a touch screen with a rear camera and motion sensors. */
const MOBILE = '(pointer: coarse) and (max-width: 1024px)';

/** Augmented vision (#92): phones only, on every plan (Free photos carry a caption, #93). */
export function Sky({ kp }: { kp: number | null }) {
  const { go } = useStore();
  const { t } = useI18n();
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => setMobile(window.matchMedia(MOBILE).matches), []);

  if (mobile === null) return <main className="wrap" style={{ minHeight: '60vh' }} />;
  if (!mobile) {
    return (
      <main className="wrap sky-page" data-screen-label="Sky view">
        <h1 className="display">{t('sky.title')}</h1>
        <p>{t('sky.mobileOnly')}</p>
        <button type="button" className="btn pill" onClick={() => go('home')}>{t('sky.back')}</button>
      </main>
    );
  }
  return <SkyView kp={kp} />;
}
