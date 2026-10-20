import { Home } from '../../screens/Home';
import { loadNow } from '../../lib/now';
import { loadAccount } from '../../lib/history';

// Rebuilt in the background at most every 2 minutes; visitors always get a cached page.
export const revalidate = 120;

export default async function Page() {
  // The Kp history and outlook feed the season and best-nights cards at the end of the Now tab on phones.
  const [now, season] = await Promise.all([loadNow(), loadAccount()]);
  return <Home data={now} season={season} />;
}
