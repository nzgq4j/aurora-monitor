import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { Badges } from '../../../screens/Badges';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('badges.title') };
}

export default function Page() {
  return <Badges />;
}
