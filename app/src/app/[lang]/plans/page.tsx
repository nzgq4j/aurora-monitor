import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { Plans } from '../../../screens/Plans';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.plans') };
}

export default function Page() {
  return <Plans />;
}
