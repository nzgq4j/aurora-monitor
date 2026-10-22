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
  it('refuses a call without the shared token', async () => {
    const res = await POST(new Request('https://x.test/api/play/rtdn?token=wrong', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });
});
