'use client';

import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';

/** A folded "What this shows" explanation under a chart, image or figure (the toggle-info style). */
export function Explain({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <details className="toggle-info">
      <summary>{t('chart.explain')}</summary>
      <p>{children}</p>
    </details>
  );
}
