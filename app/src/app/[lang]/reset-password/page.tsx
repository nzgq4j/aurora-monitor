import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { ResetPassword } from '../../../screens/ResetPassword';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.resetPassword') };
}

export default function Page() {
  return <ResetPassword />;
}
