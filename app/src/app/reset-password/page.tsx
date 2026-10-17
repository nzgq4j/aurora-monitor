import type { Metadata } from 'next';
import { ResetPassword } from '../../screens/ResetPassword';

export const metadata: Metadata = { title: 'Set a new password' };

export default function Page() {
  return <ResetPassword />;
}
