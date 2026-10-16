import type { Metadata } from 'next';
import { Account } from '../../screens/Account';

export const metadata: Metadata = { title: 'Account · OVAL' };

export default function Page() {
  return <Account />;
}
