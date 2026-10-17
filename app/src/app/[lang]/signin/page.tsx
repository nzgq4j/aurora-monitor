import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { SignIn } from '../../../screens/SignIn';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.signin') };
}

export default function Page() {
  return <SignIn />;
}
