import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { Checkout } from '../../../screens/Checkout';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.checkout') };
}

export default function Page() {
  return <Checkout />;
}
