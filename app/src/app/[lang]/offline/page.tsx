import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { Retry } from './Retry';
import { headLead } from '../../../i18n/core';

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.offline') };
}

/** Shown by the service worker when a page is requested with no connection and no cached copy. */
export default async function Offline({ params }: Props) {
  const { t } = await getI18n(await routeLocale(params));
  return (
    <main className="wrap" style={{ padding: '56px var(--gutter)', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640 }}>
      <span className="kicker">{t('offline.kicker')}</span>
      <h1 className="display" style={{ fontSize: 'var(--h-hero)', lineHeight: .88 }}>{headLead(t('offline.h1a'))}<span className="hl">{t('offline.h1b')}</span></h1>
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5, color: 'var(--soft)' }}>{t('offline.body')}</p>
      <Retry />
    </main>
  );
}
