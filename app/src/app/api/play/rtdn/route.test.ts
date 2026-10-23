import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaySubscription } from '../../../../lib/play';

// Google and the database are stand-ins; the real acknowledgement rule is used.
const play = vi.hoisted(() => ({ sub: null as PlaySubscription | null, acked: [] as string[] }));
vi.mock('../../../../lib/play', async orig => ({
  ...(await orig<typeof import('../../../../lib/play')>()),
  playAccount: () => ({}),
  getPlaySubscription: async () => play.sub,
  syncPlay: async () => ({ status: 'active' }),
  acknowledgePlay: async (_product: string, token: string) => { play.acked.push(token); },
}));
vi.mock('../../../../lib/billing', () => ({ supabaseAdmin: () => ({}) }));

import { POST } from './route';

const notify = (token: string) => new Request('https://x.test/api/play/rtdn?token=secret', {
  method: 'POST',
  body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify({ subscriptionNotification: { purchaseToken: token, notificationType: 4 } })).toString('base64') } }),
});
const sub = (ack: string): PlaySubscription => ({
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: ack,
  externalAccountIdentifiers: { obfuscatedExternalAccountId: '00000000-0000-0000-0000-00000000000a' }, lineItems: [{ productId: 'chaser' }],
});

beforeEach(() => { process.env.PLAY_RTDN_TOKEN = 'secret'; play.acked = []; });

describe('Play notifications', () => {
  it('acknowledges a purchase the app never confirmed', async () => {
    play.sub = sub('ACKNOWLEDGEMENT_STATE_PENDING');
    expect((await POST(notify('tok-1'))).status).toBe(200);
    expect(play.acked).toEqual(['tok-1']);
  });
  it('leaves an acknowledged purchase alone', async () => {
    play.sub = sub('ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED');
    expect((await POST(notify('tok-2'))).status).toBe(200);
    expect(play.acked).toEqual([]);
  });
  it('reads an unwrapped notification (push payload unwrapping on)', async () => {
    play.sub = sub('ACKNOWLEDGEMENT_STATE_PENDING');
    const res = await POST(new Request('https://x.test/api/play/rtdn?token=secret', {
      method: 'POST', body: JSON.stringify({ packageName: 'io.polarlights.app', subscriptionNotification: { purchaseToken: 'tok-3', notificationType: 4 } }),
    }));
    expect(res.status).toBe(200);
    expect(play.acked).toEqual(['tok-3']);
  });
  it('accepts a test notification, wrapped or not', async () => {
    const wrapped = { message: { data: Buffer.from(JSON.stringify({ testNotification: { version: '1.0' } })).toString('base64') } };
    for (const body of [wrapped, { packageName: 'io.polarlights.app', testNotification: { version: '1.0' } }]) {
      const res = await POST(new Request('https://x.test/api/play/rtdn?token=secret', { method: 'POST', body: JSON.stringify(body) }));
      expect(await res.json()).toEqual({ ok: true });
    }
  });
  it('refuses a call without the shared token', async () => {
    const res = await POST(new Request('https://x.test/api/play/rtdn?token=wrong', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });
});
