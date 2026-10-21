import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { loadNow } from '../../../lib/now';
import { Gallery } from '../../../screens/Gallery';

// The current Kp for the storm banner; rebuilt in the background like the Now page.
export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.gallery') };
}

export default async function Page() {
  const data = await loadNow();
  return <Gallery kp={data.kp?.kp ?? null} />;
}
