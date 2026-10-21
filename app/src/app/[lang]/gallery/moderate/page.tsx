import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../../i18n/server';
import { Moderate } from '../../../../screens/Moderate';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('mod.title'), robots: { index: false } };
}

export default function Page() {
  return <Moderate />;
}
