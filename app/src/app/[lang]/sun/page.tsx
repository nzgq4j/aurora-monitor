import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { Sun } from '../../../screens/Sun';
import { loadNow } from '../../../lib/now';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.sun') };
}

// Rebuilt in the background at most every 2 minutes, like the Now page it was part of.
export const revalidate = 120;

export default async function Page() {
  return <Sun data={await loadNow()} />;
}
