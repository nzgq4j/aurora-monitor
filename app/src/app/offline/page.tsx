import type { Metadata } from 'next';
import { Retry } from './Retry';

export const metadata: Metadata = { title: 'Offline · OVAL' };

/** Shown by the service worker when a page is requested with no connection and no cached copy. */
export default function Offline() {
  return (
    <main className="wrap" style={{ padding: '56px var(--gutter)', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640 }}>
      <span className="kicker">NO CONNECTION</span>
      <h1 className="display" style={{ fontSize: 'var(--h-hero)', lineHeight: .88 }}>You’re <span className="hl">offline</span></h1>
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5, color: 'var(--soft)' }}>
        OVAL needs a connection for live aurora data. Pages you opened recently are still available, showing the data from when you last loaded them.
      </p>
      <Retry />
    </main>
  );
}
