'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TIERS, type ChannelKey, type Tier, type TierId, type TriggerKey } from './data';
import { PAYMENTS, useAuth } from './lib/auth';
import { PLAY_MANAGE_URL, buyWithPlay, playBilling, playMissing } from './lib/playBilling';
import { DEFAULT_RULES, DEFAULT_STORM_KP, type AlertRules } from './lib/alerts';
import { supabase } from './lib/supabase';
import { useI18n } from './i18n/I18n';
import { LOCALES } from './i18n/config';

export type Screen = 'home' | 'map' | 'alerts' | 'plans' | 'checkout' | 'signin' | 'account' | 'sky';
export type Tab = 'overview' | 'alerts' | 'locations' | 'plans' | 'account';

export const PATHS: Record<Screen, string> = {
  home: '/',
  map: '/map',
  alerts: '/alerts',
  plans: '/plans',
  checkout: '/checkout',
  signin: '/signin',
  account: '/dashboard',
  sky: '/sky',
};

// While prerendering, the path still carries the proxy's language prefix (/de/map); in the browser it doesn't.
const LOCALE_PREFIX = new RegExp(`^/(${LOCALES.join('|')})(?=/|$)`);
const screenFromPath = (path: string): Screen => {
  const p = path.replace(LOCALE_PREFIX, '') || '/';
  return (Object.keys(PATHS) as Screen[]).find(s => s !== 'home' && p.startsWith(PATHS[s])) ?? 'home';
};

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
  /** Storm alert Kp (alert_settings.kp_threshold). */
  kpThreshold: number;
  alertRules: AlertRules;
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
  /** Open Stripe's billing portal (card, invoices, plan changes, cancellation). */
  openBilling: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const screen = screenFromPath(pathname);
  const auth = useAuth();
  const { t, tx } = useI18n();
  const live = auth.configured;

  // Demo mode only: landing directly on /dashboard starts signed in, like the design's "account" starting screen.
  const [s, setState] = useState<AppState>(() => ({
    tab: 'overview',
    plan: 'free',
    pending: 'chaser',
    annual: true,
    signedIn: !live && screen === 'account',
    toast: '',
    kpThreshold: DEFAULT_STORM_KP,
    alertRules: DEFAULT_RULES,
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

  // Someone who left Checkout to create an account (or sign in) comes back to it once signed in,
  // whichever page the confirmation email lands them on.
  const profileId = auth.profile?.id;
  const onFree = auth.effectivePlan === 'free';
  useEffect(() => {
    if (!live || !profileId) return;
    const intent = takeCheckoutIntent();
    if (!intent || !onFree) return;
    setState(prev => ({ ...prev, pending: intent.tier, annual: intent.annual, toast: '' }));
    if (screen !== 'checkout') router.push(PATHS.checkout);
  }, [live, profileId]); // eslint-disable-line react-hooks/exhaustive-deps -- once per sign-in

  const store = useMemo<Store>(() => {
    const set: Store['set'] = patch =>
      setState(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
    const signedIn = live ? !!auth.user : s.signedIn;
    const go: Store['go'] = (to, patch) => {
      // Signed-in members see plans inside the Dashboard; /plans stays the public pricing page.
      if (to === 'plans' && signedIn) { to = 'account'; patch = { ...patch, tab: 'plans' }; }
      if (patch) set(patch);
      if (to !== screen) router.push(PATHS[to]);
    };
    const planId = live ? auth.effectivePlan : s.plan;
    // Unknown ids (e.g. a retired plan name in an old link) fall back to Free / Chaser.
    const planIndex = Math.max(0, TIERS.findIndex(t => t.id === planId));
    const pendingIndex = Math.max(1, TIERS.findIndex(t => t.id === s.pending));
    const pending = TIERS[pendingIndex];
    const openBilling = async () => {
      // Google Play subscriptions are changed and cancelled in Google Play.
      if (auth.profile?.billingSource === 'play') { window.open(PLAY_MANAGE_URL, '_blank', 'noopener'); return; }
      const r = await auth.openBillingPortal();
      if (r.url) window.location.assign(r.url);
      else set({ toast: t('toast.billingFailed') });
    };
    // A Stripe subscription is changed or cancelled in Stripe's portal, never by flipping the plan here.
    const stripeManaged = ['trialing', 'active', 'past_due'].includes(auth.profile?.subscriptionStatus ?? '');
    const cancel = async () => {
      if (live && stripeManaged) { await openBilling(); return; }
      if (live) {
        const { error } = await auth.cancelMembership();
        set({ tab: 'overview', toast: error ? t('toast.cancelFailed', { error: tx(error) }) : t('toast.cancelled') });
      } else set({ plan: 'free', tab: 'overview', toast: t('toast.cancelled') });
    };
    return {
      s, screen, live, signedIn, set, go, planIndex, plan: TIERS[planIndex], pendingIndex, pending,
      goAccount: () => go(signedIn ? 'account' : 'signin'),
      choose: i => {
        if (i === planIndex && signedIn) return;
        if (i === 0) {
          if (!signedIn) { router.push('/signin?mode=signup'); return; }
          if (live) { void cancel().then(() => go('account')); return; }
          go('account', { plan: 'free', tab: 'overview', toast: t('toast.onFree') });
          return;
        }
        go('checkout', { pending: TIERS[i].id, toast: '' });
      },
      confirm: async () => {
        if (live) {
          if (!auth.user) { go('signin'); return; }
          // In the Android app, Google Play requires its own billing.
          if (playBilling()) {
            const r = await buyWithPlay(s.annual ? 'annual' : 'monthly', !!auth.profile?.trialEndsAt, auth.user.id, auth.verifyPlay);
            if (r === 'done') { go('account', { tab: 'overview', toast: t('toast.welcome', { plan: t(`tier.${pending.id}`) }) }); return; }
            if (r !== 'cancelled') set({ toast: t(`play.result.${r}`) });
            return;
          }
          if (playMissing()) { set({ toast: t('play.result.unavailable') }); return; }
          if (PAYMENTS) {
            const r = await auth.startCheckout(pending.id, s.annual ? 'annual' : 'monthly');
            if (r.url) { window.location.assign(r.url); return; }
            if (r.error === 'already_subscribed') { await openBilling(); return; }
            set({ toast: t('toast.checkoutFailed') });
            return;
          }
          const { error } = await auth.startTrial(pending.id, s.annual ? 'annual' : 'monthly');
          if (error) { set({ toast: t('toast.trialFailed', { error: tx(error) }) }); return; }
          go('account', { tab: 'overview', toast: t('toast.welcome', { plan: t(`tier.${pending.id}`) }) });
          return;
        }
        go('account', { plan: pending.id, signedIn: true, tab: 'overview', toast: t('toast.welcomeDemo', { plan: t(`tier.${pending.id}`) }) });
      },
      signIn: () => go('account', { signedIn: true, tab: 'overview' }),
      signOut: async () => {
        if (live) await auth.signOut();
        go('home', { signedIn: false, toast: '' });
      },
      cancelPlan: cancel,
      openBilling,
    };
  }, [s, screen, router, live, auth, t, tx]);

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
      if (data) setState(p => ({ ...p, kpThreshold: data.kp_threshold, alertRules: { ...DEFAULT_RULES, ...data.rules }, triggers: { ...p.triggers, ...data.triggers }, channels: { ...p.channels, ...data.channels } }));
      if (!error) setLoadedFor(userId);
    });
  }, [userId, setState]);
  useEffect(() => {
    const sb = supabase();
    if (!sb || !userId || loadedFor !== userId) return;
    const t = setTimeout(() => {
      // Quiet hours are read in the browser's time zone, saved alongside the rules.
      const time_zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      sb.from('alert_settings').upsert({ user_id: userId, kp_threshold: s.kpThreshold, rules: s.alertRules, time_zone, triggers: s.triggers, channels: s.channels, updated_at: new Date().toISOString() });
    }, 800);
    return () => clearTimeout(t);
  }, [userId, loadedFor, s.kpThreshold, s.alertRules, s.triggers, s.channels]);
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

const INTENT_KEY = 'pl.checkout.intent';
interface CheckoutIntent { tier: TierId; annual: boolean; at: number }

/** Remember that the visitor left Checkout to sign up or sign in, so they can be brought back. */
export function rememberCheckoutIntent(tier: TierId, annual: boolean) {
  try { localStorage.setItem(INTENT_KEY, JSON.stringify({ tier, annual, at: Date.now() } satisfies CheckoutIntent)); } catch { /* storage unavailable */ }
}

/** Read and clear a remembered Checkout visit; ignored after a day (or if the plan no longer exists). */
function takeCheckoutIntent(): CheckoutIntent | null {
  try {
    const raw = localStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    localStorage.removeItem(INTENT_KEY);
    const v = JSON.parse(raw) as CheckoutIntent;
    return Date.now() - v.at < 864e5 && TIERS.some(t => t.id === v.tier && t.m > 0) ? v : null;
  } catch { return null; }
}

/** Displayed per-month price for a tier under the current billing cycle, formatted by `money`. */
export const displayPrice = (t: Tier, annual: boolean, money: (usd: number) => string) =>
  money(annual ? +(t.y / 12).toFixed(2) : t.m);
