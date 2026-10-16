import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { TIERS, type ChannelKey, type Tier, type TierId, type TriggerKey } from './data';

export type Screen = 'home' | 'plans' | 'checkout' | 'signin' | 'account';
export type Tab = 'overview' | 'alerts' | 'locations' | 'billing';

export interface AppState {
  screen: Screen;
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

const SCREENS: Screen[] = ['home', 'plans', 'checkout', 'signin', 'account'];

/**
 * Initial state. `?screen=` and `?plan=` mirror the design's "starting screen"
 * and "starting plan" settings so any state can be opened directly.
 */
function initialState(): AppState {
  const q = new URLSearchParams(window.location.search);
  const screen = SCREENS.find(s => s === q.get('screen')) ?? 'home';
  const plan = TIERS.find(t => t.id === q.get('plan'))?.id ?? 'free';
  return {
    screen,
    tab: 'overview',
    plan,
    pending: 'chaser',
    annual: true,
    signedIn: screen === 'account',
    toast: '',
    kpThreshold: 5,
    channels: { email: true, push: true, sms: false },
    triggers: { kp: true, cme: true, clear: true, bz: false, sub: false },
  };
}

interface Store {
  s: AppState;
  set: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  /** Index into TIERS of the current plan. */
  planIndex: number;
  plan: Tier;
  pendingIndex: number;
  pending: Tier;
  go: (screen: Screen) => void;
  goAccount: () => void;
  /** Handle a tier card's call to action. */
  choose: (index: number) => void;
  confirm: () => void;
  signIn: () => void;
  signOut: () => void;
  cancelPlan: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setState] = useState(initialState);

  const store = useMemo<Store>(() => {
    const set: Store['set'] = patch =>
      setState(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
    const planIndex = TIERS.findIndex(t => t.id === s.plan);
    const pendingIndex = TIERS.findIndex(t => t.id === s.pending);
    const pending = TIERS[pendingIndex];
    return {
      s, set, planIndex, plan: TIERS[planIndex], pendingIndex, pending,
      go: screen => set({ screen }),
      goAccount: () => set({ screen: s.signedIn ? 'account' : 'signin' }),
      choose: i => {
        if (i === planIndex && s.signedIn) return;
        if (i === 0) {
          set({ plan: 'free', screen: s.signedIn ? 'account' : 'signin', tab: 'overview', toast: s.signedIn ? 'You’re on the Free plan.' : '' });
          return;
        }
        set({ pending: TIERS[i].id, screen: 'checkout', toast: '' });
      },
      confirm: () => set({ plan: pending.id, signedIn: true, screen: 'account', tab: 'overview', toast: `Welcome to ${pending.name}. Your 14-day trial has started — alerts are live.` }),
      signIn: () => set({ signedIn: true, screen: 'account', tab: 'overview' }),
      signOut: () => set({ signedIn: false, screen: 'home', toast: '' }),
      cancelPlan: () => set({ plan: 'free', tab: 'overview', toast: 'Membership cancelled. You’re back on Free.' }),
    };
  }, [s]);

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
