import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { kpNow } from '../../../lib/feeds';
import { AuroraMap } from '../../../screens/AuroraMap';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.map') };
}

export const revalidate = 120;

export default async function Page() {
  const kp = await kpNow();
  return <AuroraMap kp={kp?.kp ?? null} />;
}
