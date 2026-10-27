import { describe, expect, it } from 'vitest';
import { needsAcknowledging, playStatus, purchaseOwner, type PlaySubscription } from './play';

const now = Date.parse('2026-10-22T12:00:00Z');
const sub = (state: string, o: { expiry?: string; trial?: boolean; plan?: string; autoRenew?: boolean } = {}): PlaySubscription => ({
  subscriptionState: state,
  lineItems: [{
    productId: 'chaser',
    expiryTime: o.expiry ?? '2026-11-22T12:00:00Z',
    offerPhase: o.trial ? { freeTrial: {} } : undefined,
    offerDetails: { basePlanId: o.plan ?? 'monthly' },
    autoRenewingPlan: { autoRenewEnabled: o.autoRenew ?? true },
  }],
} as unknown as PlaySubscription);

describe('playStatus', () => {
  it('maps active, trial and grace period to paid statuses', () => {
    expect(playStatus(sub('SUBSCRIPTION_STATE_ACTIVE'), now)).toMatchObject({ status: 'active', paid: true, cycle: 'monthly' });
    expect(playStatus(sub('SUBSCRIPTION_STATE_ACTIVE', { trial: true }), now)).toMatchObject({ status: 'trialing', paid: true, trial: true });
    expect(playStatus(sub('SUBSCRIPTION_STATE_IN_GRACE_PERIOD'), now)).toMatchObject({ status: 'past_due', paid: true });
  });
  it('keeps a cancelled subscription paid until it runs out', () => {
    expect(playStatus(sub('SUBSCRIPTION_STATE_CANCELED'), now)).toMatchObject({ status: 'active', paid: true, cancelAtPeriodEnd: true });
    expect(playStatus(sub('SUBSCRIPTION_STATE_CANCELED', { expiry: '2026-10-01T00:00:00Z' }), now)).toMatchObject({ status: 'canceled', paid: false });
  });
  it('treats hold, pause, expiry and pending as unpaid', () => {
    for (const s of ['SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING', 'SOMETHING_NEW']) {
      expect(playStatus(sub(s), now).paid).toBe(false);
    }
  });
  it('reads the cycle and auto-renew setting', () => {
    expect(playStatus(sub('SUBSCRIPTION_STATE_ACTIVE', { plan: 'annual', autoRenew: false }), now)).toMatchObject({ cycle: 'annual', cancelAtPeriodEnd: true });
  });
});

describe('needsAcknowledging', () => {
  it('is true for a pending acknowledgement once payment has gone through', () => {
    expect(needsAcknowledging({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' })).toBe(true);
  });
  it('is false when already acknowledged or while the payment is pending', () => {
    expect(needsAcknowledging({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' })).toBe(false);
    expect(needsAcknowledging({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' })).toBe(false);
  });
});

describe('purchaseOwner', () => {
  it('lets members take purchases made for them, never ones made for someone else', () => {
    expect(purchaseOwner('u1', 'u1', null)).toBe('own');
    expect(purchaseOwner('u2', 'u1', null)).toBe('other');
  });

  it('lets a member claim a purchase with no account (a redeemed promo code) unless another member holds it', () => {
    expect(purchaseOwner(undefined, 'u1', null)).toBe('claim');
    expect(purchaseOwner(null, 'u1', 'u1')).toBe('claim');
    expect(purchaseOwner(undefined, 'u1', 'u2')).toBe('other');
  });
});
