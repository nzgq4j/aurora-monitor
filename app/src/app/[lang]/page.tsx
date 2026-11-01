import { Home } from '../../screens/Home';
import { loadNow } from '../../lib/now';
import { loadAccount } from '../../lib/history';

// Rebuilt in the background at most every 2 minutes; visitors always get a cached page.
// Rendered on each request (the feeds themselves are cached for two minutes): as a revalidated (ISR) page
// Vercel kept serving copies hours old.
export const dynamic = 'force-dynamic';

export default async function Page() {
  // The Kp history and outlook feed the season and best-nights cards at the end of the Now tab on phones.
  const [now, season] = await Promise.all([loadNow(), loadAccount()]);
  return <Home data={now} season={season} />;
}
