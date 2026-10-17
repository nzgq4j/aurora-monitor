import { Home } from '../screens/Home';
import { loadNow } from '../lib/now';

// Rebuilt in the background at most every 2 minutes; visitors always get a cached page.
export const revalidate = 120;

export default async function Page() {
  return <Home data={await loadNow()} />;
}
