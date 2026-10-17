'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Provider, User } from '@supabase/supabase-js';
import type { TierId } from '../data';
import { supabase } from './supabase';
import { applyLocale, useI18n } from '../i18n/I18n';
import { isLocale, type Locale } from '../i18n/config';

export interface Profile {
  id: string;
  displayName: string | null;
  plan: TierId;
  billingCycle: 'monthly' | 'annual';
  trialEndsAt: string | null;
  createdAt: string;
  /** Chosen language; null until the user (or their first visit) sets one. */
  locale: Locale | null;
}

interface ProfileRow { id: string; display_name: string | null; plan: TierId; billing_cycle: 'monthly' | 'annual'; trial_ends_at: string | null; created_at: string; locale: string | null }
const fromRow = (r: ProfileRow): Profile => ({ id: r.id, displayName: r.display_name, plan: r.plan, billingCycle: r.billing_cycle, trialEndsAt: r.trial_ends_at, createdAt: r.created_at, locale: isLocale(r.locale) ? r.locale : null });

type Result = { error: string | null };

interface AuthCtx {
  /** False until Supabase is connected; the app then runs in demo mode. */
  configured: boolean;
  /** True once the initial session check has finished. */
  ready: boolean;
  user: User | null;
  profile: Profile | null;
  /** Plan in force: a paid tier while its trial is running, otherwise Free. */
  effectivePlan: TierId;
  trialExpired: boolean;
  signUp: (email: string, password: string, name: string) => Promise<Result & { needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<Result>;
  signInWithProvider: (provider: Extract<Provider, 'google' | 'apple'>) => Promise<Result>;
  sendPasswordReset: (email: string) => Promise<Result>;
  updatePassword: (password: string) => Promise<Result>;
  updateName: (name: string) => Promise<Result>;
  /** Save the language to the profile (and user metadata, for localised emails). */
  saveLocale: (locale: Locale) => Promise<Result>;
  signOut: () => Promise<void>;
  startTrial: (tier: TierId, cycle: 'monthly' | 'annual') => Promise<Result>;
  cancelMembership: () => Promise<Result>;
}

const Ctx = createContext<AuthCtx | null>(null);

/** Known errors become message keys (translated where shown); anything else is passed through as-is. */
const friendly = (msg: string) =>
  /invalid login/i.test(msg) ? 'err.invalidLogin'
    : /already registered|already exists/i.test(msg) ? 'err.exists'
    : /provider is not enabled|unsupported provider/i.test(msg) ? 'err.provider'
    : /email not confirmed/i.test(msg) ? 'err.unconfirmed'
    : /failed to fetch|network|load failed/i.test(msg) ? 'err.network'
    : /different from the old password/i.test(msg) ? 'err.samePassword'
    : /password should be|weak password/i.test(msg) ? 'err.weakPassword'
    : /rate limit|too many requests/i.test(msg) ? 'err.rateLimit'
    : msg;

export function AuthProvider({ children }: { children: ReactNode }) {
  const sb = supabase();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(!sb);
  const { locale } = useI18n();

  const loadProfile = useCallback(async (u: User | null) => {
    if (!sb || !u) { setProfile(null); return; }
    const { data } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
    setProfile(data ? fromRow(data as ProfileRow) : null);
  }, [sb]);

  useEffect(() => {
    if (!sb) return;
    let live = true;
    sb.auth.getSession().then(async ({ data }) => {
      if (!live) return;
      setUser(data.session?.user ?? null);
      await loadProfile(data.session?.user ?? null);
      if (live) setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      // Defer the query so it doesn't run inside the auth callback.
      setTimeout(() => loadProfile(session?.user ?? null), 0);
    });
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, [sb, loadProfile]);

  // The account's language wins over this browser's: switch to it once per session.
  // An account without one adopts the language in use now.
  useEffect(() => {
    if (!sb || !profile) return;
    if (!profile.locale) { void sb.from('profiles').update({ locale }).eq('id', profile.id); return; }
    if (profile.locale === locale) return;
    try {
      if (sessionStorage.getItem('pl.lang.synced')) return;
      sessionStorage.setItem('pl.lang.synced', '1');
    } catch { return; }
    applyLocale(profile.locale);
  }, [sb, profile, locale]);

  const value = useMemo<AuthCtx>(() => {
    const none = { error: 'err.notConnected' };
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const trialExpired = !!profile && profile.plan !== 'free' && !!profile.trialEndsAt && Date.parse(profile.trialEndsAt) < Date.now();
    return {
      configured: !!sb, ready, user, profile,
      effectivePlan: profile && !trialExpired ? profile.plan : 'free',
      trialExpired,
      signUp: async (email, password, name) => {
        if (!sb) return { ...none, needsConfirmation: false };
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name, locale }, emailRedirectTo: `${origin}/dashboard` } });
        return { error: error ? friendly(error.message) : null, needsConfirmation: !error && !data.session };
      },
      signIn: async (email, password) => {
        if (!sb) return none;
        const { error } = await sb.auth.signInWithPassword({ email, password });
        return { error: error ? friendly(error.message) : null };
      },
      signInWithProvider: async provider => {
        if (!sb) return none;
        const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: `${origin}/dashboard` } });
        return { error: error ? friendly(error.message) : null };
      },
      sendPasswordReset: async email => {
        if (!sb) return none;
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` });
        return { error: error ? friendly(error.message) : null };
      },
      updatePassword: async password => {
        if (!sb) return none;
        const { error } = await sb.auth.updateUser({ password });
        return { error: error ? friendly(error.message) : null };
      },
      updateName: async name => {
        if (!sb || !user) return none;
        const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', user.id);
        if (!error) await loadProfile(user);
        return { error: error?.message ?? null };
      },
      saveLocale: async next => {
        if (!sb || !user) return none;
        const [{ error }] = await Promise.all([
          sb.from('profiles').update({ locale: next }).eq('id', user.id),
          sb.auth.updateUser({ data: { locale: next } }),
        ]);
        return { error: error?.message ?? null };
      },
      signOut: async () => { if (sb) await sb.auth.signOut(); setProfile(null); },
      startTrial: async (tier, cycle) => {
        if (!sb || !user) return none;
        const { error } = await sb.rpc('start_trial', { tier, cycle });
        if (!error) await loadProfile(user);
        return { error: error?.message ?? null };
      },
      cancelMembership: async () => {
        if (!sb || !user) return none;
        const { error } = await sb.rpc('cancel_membership');
        if (!error) await loadProfile(user);
        return { error: error?.message ?? null };
      },
    };
  }, [sb, ready, user, profile, loadProfile, locale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** Two-letter initials from a name or email. */
export function initials(name: string | null | undefined, email: string | null | undefined): string {
  const src = (name || email || '').trim();
  if (!src) return '··';
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}
