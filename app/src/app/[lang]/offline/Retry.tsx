'use client';

import { useI18n } from '../../../i18n/I18n';

export function Retry() {
  const { t } = useI18n();
  return (
    <button type="button" className="btn pill pill-primary" onClick={() => {
      // Go back to the page that couldn't load (only same-site paths).
      const from = new URLSearchParams(location.search).get('from');
      location.href = from && from.startsWith('/') && !from.startsWith('//') ? from : '/';
    }} style={{ alignSelf: 'flex-start', fontSize: 15, padding: '14px 22px' }}>
      {t('offline.retry')}
    </button>
  );
}
