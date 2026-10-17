import type { Metadata } from 'next';
import { Checkout } from '../../screens/Checkout';

export const metadata: Metadata = { title: 'Checkout' };

export default function Page() {
  return <Checkout />;
}
