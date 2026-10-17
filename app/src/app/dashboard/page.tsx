import type { Metadata } from 'next';
import { Account } from '../../screens/Account';
import { loadAccount } from '../../lib/history';

export const metadata: Metadata = { title: 'Dashboard' };
export const revalidate = 1800;

export default async function Page() {
  return <Account data={await loadAccount()} />;
}
