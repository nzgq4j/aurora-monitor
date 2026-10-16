import type { Metadata } from 'next';
import { Checkout } from '../../screens/Checkout';

export const metadata: Metadata = { title: 'Checkout · OVAL' };

export default function Page() {
  return <Checkout />;
}
