import type { Metadata } from 'next';
import { Plans } from '../../screens/Plans';

export const metadata: Metadata = { title: 'Plans' };

export default function Page() {
  return <Plans />;
}
