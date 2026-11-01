import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { kpNow, kpSeries } from '../../../lib/feeds';
import { AuroraMap } from '../../../screens/AuroraMap';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.map') };
}

// Rendered on each request (the feeds themselves are cached for two minutes): as a revalidated (ISR) page
// Vercel kept serving copies hours old.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [kp, series] = await Promise.all([kpNow(), kpSeries()]);
  return <AuroraMap kp={kp?.kp ?? null} series={series} />;
}
