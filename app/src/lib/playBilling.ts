'use client';

import { inApp, nativePlugin } from './native';

/**
 * Google Play Billing in the Android app (PlayBillingPlugin.java). Google Play requires subscriptions
 * bought in the app to go through Play, so there the Chaser plan is sold with Play instead of Stripe.
 * Switched on with NEXT_PUBLIC_PLAY_BILLING=1 once the subscription exists in Play Console.
 */

export const PLAY_PRODUCT = 'chaser';
const ENABLED = process.env.NEXT_PUBLIC_PLAY_BILLING === '1';
/** Google Play's subscriptions page for this app, where Play subscriptions are changed or cancelled. */
export const PLAY_MANAGE_URL = `https://play.google.com/store/account/subscriptions?sku=${PLAY_PRODUCT}&package=io.polarlights.app`;

interface Phase { formattedPrice: string; priceMicros: number; currency: string; billingPeriod: string; cycles: number; recurrence: number }
interface Offer { basePlanId: string; offerId: string | null; offerToken: string; phases: Phase[] }
interface Purchase { purchaseToken: string; products: string[]; state: 'purchased' | 'pending' | 'unspecified'; acknowledged: boolean; accountId: string | null }
interface PlayBilling {
  getProducts: (o: { productIds: string[] }) => Promise<{ products: { productId: string; offers: Offer[] }[] }>;
  purchase: (o: { productId: string; offerToken: string; accountId: string }) => Promise<{ purchases: Purchase[] }>;
  queryPurchases: () => Promise<{ purchases: Purchase[] }>;
}

export type Cycle = 'monthly' | 'annual';
export interface PlayPrice { offerToken: string; trial: boolean; price: string }
export type PlayOffers = Record<Cycle, { base: PlayPrice | null; trial: PlayPrice | null }>;

/** The plugin, in an app build that has it and once Play billing is switched on. */
export const playBilling = () => (ENABLED ? nativePlugin<PlayBilling>('PlayBilling') : null);
/** In the app, but Play billing isn't available (an older build, or not switched on yet). */
export const playMissing = () => inApp() && !playBilling();

let offers: Promise<PlayOffers | null> | null = null;
/** The Chaser base plans and their free-trial offers, with Play's prices in the user's currency. */
export function playOffers(): Promise<PlayOffers | null> {
  const pb = playBilling();
  if (!pb) return Promise.resolve(null);
  return (offers ??= pb.getProducts({ productIds: [PLAY_PRODUCT] }).then(({ products }) => {
    const list = products.find(p => p.productId === PLAY_PRODUCT)?.offers ?? [];
    const pick = (cycle: Cycle) => {
      const plan = list.filter(o => o.basePlanId === cycle);
      const price = (o: Offer) => o.phases[o.phases.length - 1]?.formattedPrice ?? '';
      const base = plan.find(o => !o.offerId);
      const trial = plan.find(o => o.offerId && o.phases.some(ph => ph.priceMicros === 0));
      return {
        base: base ? { offerToken: base.offerToken, trial: false, price: price(base) } : null,
        trial: trial ? { offerToken: trial.offerToken, trial: true, price: price(trial) } : null,
      };
    };
    return { monthly: pick('monthly'), annual: pick('annual') };
  }).catch(() => { offers = null; return null; }));
}

export type PlayResult = 'done' | 'cancelled' | 'pending' | 'already_owned' | 'unavailable' | 'failed';

/**
 * Buy Chaser through Google Play: the trial offer when the account hasn't had its trial, else the base
 * plan. Each purchase is tagged with the user's ID and checked on the server (`verify`), which
 * acknowledges it and updates the profile.
 */
export async function buyWithPlay(cycle: Cycle, trialUsed: boolean, userId: string, verify: (token: string) => Promise<boolean>): Promise<PlayResult> {
  const pb = playBilling();
  const o = await playOffers();
  const offer = o && (trialUsed ? o[cycle].base : o[cycle].trial ?? o[cycle].base);
  if (!pb || !offer) return 'unavailable';
  try {
    const { purchases } = await pb.purchase({ productId: PLAY_PRODUCT, offerToken: offer.offerToken, accountId: userId });
    const bought = purchases.filter(p => p.products.includes(PLAY_PRODUCT));
    if (bought.some(p => p.state === 'pending')) return 'pending';
    const ok = await Promise.all(bought.filter(p => p.state === 'purchased').map(p => verify(p.purchaseToken)));
    return ok.length && ok.every(Boolean) ? 'done' : 'failed';
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code === 'cancelled' || code === 'pending' || code === 'already_owned' || code === 'unavailable' ? code : 'failed';
  }
}

/**
 * When the app starts: a Play purchase for this account that the server hasn't confirmed yet (the app
 * closed mid-purchase, or the network dropped) is sent again, so it's never left unacknowledged.
 * Returns true when something was sent.
 */
export async function resendPlayPurchases(userId: string, known: string | null, verify: (token: string) => Promise<boolean>): Promise<boolean> {
  const pb = playBilling();
  if (!pb) return false;
  const { purchases } = await pb.queryPurchases();
  const todo = purchases.filter(p => p.state === 'purchased' && p.accountId === userId && p.products.includes(PLAY_PRODUCT) && (!p.acknowledged || p.purchaseToken !== known));
  if (!todo.length) return false;
  await Promise.all(todo.map(p => verify(p.purchaseToken)));
  return true;
}
