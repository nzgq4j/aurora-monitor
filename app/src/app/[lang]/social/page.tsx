import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { Social } from '../../../screens/Social';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('social.title'), robots: { index: false, follow: false } };
}

/** Automatic Bluesky posting (administrators only; every API call is checked on the server). */
export default function Page() {
  return <Social />;
}
