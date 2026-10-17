'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TIERS, type ChannelKey, type Tier, type TierId, type TriggerKey } from './data';
import { useAuth } from './lib/auth';
import { supabase } from './lib/supabase';

export type Screen = 'home' | 'map' | 'plans' | 'checkout' | 'signin' | 'account';
export type Tab = 'overview' | 'alerts' | 'locations' | 'billing';

export const PATHS: Record<Screen, string> = {
  home: '/',
  map: '/map',
  plans: '/plans',
  checkout: '/checkout',
  signin: '/signin',
  account: '/account',
};

const screenFromPath = (path: string): Screen =>
  (Object.keys(PATHS) as Screen[]).find(s => s !== 'home' && path.startsWith(PATHS[s])) ?? 'home';

export interface AppState {
  tab: Tab;
  /** Demo-mode plan; with accounts connected the plan comes from the user's profile. */
  plan: TierId;
  /** Tier selected on Plans and shown on Checkout. */
  pending: TierId;
  annual: boolean;
  /** Demo-mode sign-in flag; with accounts connected this comes from the session. */
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
  /** True when real accounts (Supabase) are connected. */
  live: boolean;
  signedIn: boolean;
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
  confirm: () => Promise<void>;
  /** Demo-mode sign in. */
  signIn: () => void;
  signOut: () => Promise<void>;
  cancelPlan: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const screen = screenFromPath(pathname);
  const auth = useAuth();
  const live = auth.configured;

  // Demo mode only: landing directly on /account starts signed in, like the design's "account" starting screen.
  const [s, setState] = useState<AppState>(() => ({
    tab: 'overview',
    plan: 'free',
    pending: 'chaser',
    annual: true,
    signedIn: !live && screen === 'account',
    toast: '',
    kpThreshold: 5,
    channels: { email: true, push: true, sms: false },
    triggers: { kp: true, cme: true, clear: true, bz: false, sub: false },
  }));

  // Demo mode: `?plan=` mirrors the design's "starting plan" setting.
  useEffect(() => {
    if (live) return;
    const plan = TIERS.find(t => t.id === new URLSearchParams(window.location.search).get('plan'))?.id;
    if (plan) setState(prev => ({ ...prev, plan }));
  }, [live]);

  useAlertSettingsSync(s, setState, auth.user?.id ?? null);

  const store = useMemo<Store>(() => {
    const set: Store['set'] = patch =>
      setState(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
    const go: Store['go'] = (to, patch) => {
      if (patch) set(patch);
      if (to !== screen) router.push(PATHS[to]);
    };
    const signedIn = live ? !!auth.user : s.signedIn;
    const planId = live ? auth.effectivePlan : s.plan;
    // Unknown ids (e.g. a retired plan name in an old link) fall back to Free / Chaser.
    const planIndex = Math.max(0, TIERS.findIndex(t => t.id === planId));
    const pendingIndex = Math.max(1, TIERS.findIndex(t => t.id === s.pending));
    const pending = TIERS[pendingIndex];
    const cancel = async () => {
      if (live) {
        const { error } = await auth.cancelMembership();
        set({ tab: 'overview', toast: error ? `Couldn’t cancel: ${error}` : 'Membership cancelled. You’re back on Free.' });
      } else set({ plan: 'free', tab: 'overview', toast: 'Membership cancelled. You’re back on Free.' });
    };
    return {
      s, screen, live, signedIn, set, go, planIndex, plan: TIERS[planIndex], pendingIndex, pending,
      goAccount: () => go(signedIn ? 'account' : 'signin'),
      choose: i => {
        if (i === planIndex && signedIn) return;
        if (i === 0) {
          if (!signedIn) { go('signin'); return; }
          if (live) { void cancel().then(() => go('account')); return; }
          go('account', { plan: 'free', tab: 'overview', toast: 'You’re on the Free plan.' });
          return;
        }
        go('checkout', { pending: TIERS[i].id, toast: '' });
      },
      confirm: async () => {
        if (live) {
          if (!auth.user) { go('signin'); return; }
          const { error } = await auth.startTrial(pending.id, s.annual ? 'annual' : 'monthly');
          if (error) { set({ toast: `Couldn’t start the trial: ${error}` }); return; }
          go('account', { tab: 'overview', toast: `Welcome to ${pending.name}. Your 14-day trial has started.` });
          return;
        }
        go('account', { plan: pending.id, signedIn: true, tab: 'overview', toast: `Welcome to ${pending.name}. Your 14-day trial has started — alerts are live.` });
      },
      signIn: () => go('account', { signedIn: true, tab: 'overview' }),
      signOut: async () => {
        if (live) await auth.signOut();
        go('home', { signedIn: false, toast: '' });
      },
      cancelPlan: cancel,
    };
  }, [s, screen, router, live, auth]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** Load the signed-in user's alert settings, and save changes back (debounced). */
function useAlertSettingsSync(s: AppState, setState: (f: (p: AppState) => AppState) => void, userId: string | null) {
  const requested = useRef<string | null>(null);
  // Only start saving once the stored settings have been read, so defaults never overwrite them.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    const sb = supabase();
    if (!sb || !userId || requested.current === userId) return;
    requested.current = userId;
    sb.from('alert_settings').select('*').eq('user_id', userId).maybeSingle().then(({ data, error }) => {
      if (data) setState(p => ({ ...p, kpThreshold: data.kp_threshold, triggers: { ...p.triggers, ...data.triggers }, channels: { ...p.channels, ...data.channels } }));
      if (!error) setLoadedFor(userId);
    });
  }, [userId, setState]);
  useEffect(() => {
    const sb = supabase();
    if (!sb || !userId || loadedFor !== userId) return;
    const t = setTimeout(() => {
      sb.from('alert_settings').upsert({ user_id: userId, kp_threshold: s.kpThreshold, triggers: s.triggers, channels: s.channels, updated_at: new Date().toISOString() });
    }, 800);
    return () => clearTimeout(t);
  }, [userId, loadedFor, s.kpThreshold, s.triggers, s.channels]);
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

/** Displayed per-month price for a tier under the current billing cycle. */
export const displayPrice = (t: Tier, annual: boolean) =>
  annual ? (t.y ? '$' + (t.y / 12).toFixed(t.y % 12 ? 2 : 0) : '$0') : '$' + t.m;
