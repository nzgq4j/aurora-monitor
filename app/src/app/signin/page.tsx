import type { Metadata } from 'next';
import { SignIn } from '../../screens/SignIn';

export const metadata: Metadata = { title: 'Sign in · OVAL' };

export default function Page() {
  return <SignIn />;
}
