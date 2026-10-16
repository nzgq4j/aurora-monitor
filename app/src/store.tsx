'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TIERS, type ChannelKey, type Tier, type TierId, type TriggerKey } from './data';

export type Screen = 'home' | 'plans' | 'checkout' | 'signin' | 'account';
export type Tab = 'overview' | 'alerts' | 'locations' | 'billing';

export const PATHS: Record<Screen, string> = {
  home: '/',
  plans: '/plans',
  checkout: '/checkout',
  signin: '/signin',
  account: '/account',
};

const screenFromPath = (path: string): Screen =>
  (Object.keys(PATHS) as Screen[]).find(s => s !== 'home' && path.startsWith(PATHS[s])) ?? 'home';

export interface AppState {
  tab: Tab;
  plan: TierId;
  /** Tier selected on Plans and shown on Checkout. */
  pending: TierId;
  annual: boolean;
  signedIn: boolean;
  toast: string;
  kpThreshold: number;
  channels: Record<ChannelKey, boolean>;
  triggers: Record<TriggerKey, boolean>;
}

interface Store {
  s: AppState;
  /** Current screen, derived from the route. */
  screen: Screen;
  set: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  /** Index into TIERS of the current plan. */
  planIndex: number;
  plan: Tier;
  pendingIndex: number;
  pending: Tier;
  /** Navigate to a screen, optionally applying a state change first. */
  go: (screen: Screen, patch?: Partial<AppState>) => void;
  goAccount: () => void;
  /** Handle a tier card's call to action. */
  choose: (index: number) => void;
  confirm: () => void;
  signIn: () => void;
  signOut: () => void;
  cancelPlan: () => void;
}

const Ctx = createContext<Store | null>(null);

/**
 * Prototype state lives in this provider, which the root layout keeps mounted
 * across client-side navigation. There is no backend, so a full reload resets it.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const screen = screenFromPath(pathname);

  // Landing directly on /account starts signed in, like the design's "account" starting screen.
  const [s, setState] = useState<AppState>(() => ({
    tab: 'overview',
    plan: 'free',
    pending: 'chaser',
    annual: true,
    signedIn: screen === 'account',
    toast: '',
    kpThreshold: 5,
    channels: { email: true, push: true, sms: false },
    triggers: { kp: true, cme: true, clear: true, bz: false, sub: false },
  }));

  // `?plan=` mirrors the design's "starting plan" setting.
  useEffect(() => {
    const plan = TIERS.find(t => t.id === new URLSearchParams(window.location.search).get('plan'))?.id;
    if (plan) setState(prev => ({ ...prev, plan }));
  }, []);

  const store = useMemo<Store>(() => {
    const set: Store['set'] = patch =>
      setState(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
    const go: Store['go'] = (to, patch) => {
      if (patch) set(patch);
      if (to !== screen) router.push(PATHS[to]);
    };
    const planIndex = TIERS.findIndex(t => t.id === s.plan);
    const pendingIndex = TIERS.findIndex(t => t.id === s.pending);
    const pending = TIERS[pendingIndex];
    return {
      s, screen, set, go, planIndex, plan: TIERS[planIndex], pendingIndex, pending,
      goAccount: () => go(s.signedIn ? 'account' : 'signin'),
      choose: i => {
        if (i === planIndex && s.signedIn) return;
        if (i === 0) {
          go(s.signedIn ? 'account' : 'signin', { plan: 'free', tab: 'overview', toast: s.signedIn ? 'You’re on the Free plan.' : '' });
          return;
        }
        go('checkout', { pending: TIERS[i].id, toast: '' });
      },
      confirm: () => go('account', { plan: pending.id, signedIn: true, tab: 'overview', toast: `Welcome to ${pending.name}. Your 14-day trial has started — alerts are live.` }),
      signIn: () => go('account', { signedIn: true, tab: 'overview' }),
      signOut: () => go('home', { signedIn: false, toast: '' }),
      cancelPlan: () => set({ plan: 'free', tab: 'overview', toast: 'Membership cancelled. You’re back on Free.' }),
    };
  }, [s, screen, router]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

/** Displayed per-month price for a tier under the current billing cycle. */
export const displayPrice = (t: Tier, annual: boolean) =>
  annual ? (t.y ? '$' + (t.y / 12).toFixed(t.y % 12 ? 2 : 0) : '$0') : '$' + t.m;
