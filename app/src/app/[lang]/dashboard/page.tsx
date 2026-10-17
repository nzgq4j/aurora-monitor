import type { Metadata } from 'next';
import { getI18n, routeLocale } from '../../../i18n/server';
import { Account } from '../../../screens/Account';
import { loadAccount } from '../../../lib/history';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { t } = await getI18n(await routeLocale(params));
  return { title: t('title.dashboard') };
}

export const revalidate = 1800;

export default async function Page() {
  return <Account data={await loadAccount()} />;
}
