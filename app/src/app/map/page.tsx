import type { Metadata } from 'next';
import { kpNow } from '../../lib/feeds';
import { AuroraMap } from '../../screens/AuroraMap';

export const metadata: Metadata = { title: 'Aurora map' };
export const revalidate = 120;

export default async function Page() {
  const kp = await kpNow();
  return <AuroraMap kp={kp?.kp ?? null} />;
}
