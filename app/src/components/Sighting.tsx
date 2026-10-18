'use client';

import { useState } from 'react';
import { useStore } from '../store';
import { nearbyCount, reportSighting, setBrightness, type Brightness } from '../lib/sightings';
import { useI18n } from '../i18n/I18n';

const LEVELS: Brightness[] = ['faint', 'visible', 'bright'];

/**
 * "I saw it" on the verdict card (#67): one tap reports a sighting at the shown place with the current
 * score; then thanks with how many others reported aurora nearby in the last hour, and an optional
 * "how bright?". Only active while it's dark there; signing in is required to report.
 */
export function Sighting({ lat, lon, score, dark }: { lat: number; lon: number; score: number | null; dark: boolean }) {
  const { signedIn, go } = useStore();
  const { t, tn } = useI18n();
  const [state, setState] = useState<{ id: number; others: number | null } | 'busy' | 'limit' | 'error' | null>(null);
  const [bright, setBright] = useState<Brightness | null>(null);

  const report = async () => {
    if (!signedIn) { go('signin'); return; }
    setState('busy');
    const r = await reportSighting(lat, lon, score);
    if (!r.ok) { if (r.reason === 'signin') go('signin'); else setState(r.reason); return; }
    setState({ id: r.id, others: await nearbyCount(lat, lon) });
  };

  if (state && typeof state === 'object') {
    return (
      <div className="sighting sighting-done" role="status">
        <span>{state.others ? tn('sight.thanks', state.others) : t('sight.thanksFirst')}</span>
        <span className="sighting-levels" role="group" aria-label={t('sight.howBright')}>
          <small>{t('sight.howBright')}</small>
          {LEVELS.map(l => (
            <button key={l} type="button" className="btn" aria-pressed={bright === l}
              onClick={async () => { if (await setBrightness(state.id, l)) setBright(l); }}>
              {t(`sight.b.${l}`)}
            </button>
          ))}
        </span>
      </div>
    );
  }
  return (
    <div className="sighting">
      <button type="button" className="btn pill sighting-btn" disabled={!dark || state === 'busy'} onClick={report}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        {t('sight.button')}
      </button>
      <small>
        {state === 'limit' ? t('sight.limit') : state === 'error' ? t('sight.error') : !dark ? t('sight.darkOnly') : !signedIn ? t('sight.signIn') : t('sight.hint')}
      </small>
    </div>
  );
}
