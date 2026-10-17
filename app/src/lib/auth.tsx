'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Provider, User } from '@supabase/supabase-js';
import type { TierId } from '../data';
import { supabase } from './supabase';

export interface Profile {
  id: string;
  displayName: string | null;
  plan: TierId;
  billingCycle: 'monthly' | 'annual';
  trialEndsAt: string | null;
  createdAt: string;
}

interface ProfileRow { id: string; display_name: string | null; plan: TierId; billing_cycle: 'monthly' | 'annual'; trial_ends_at: string | null; created_at: string }
const fromRow = (r: ProfileRow): Profile => ({ id: r.id, displayName: r.display_name, plan: r.plan, billingCycle: r.billing_cycle, trialEndsAt: r.trial_ends_at, createdAt: r.created_at });

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
  signOut: () => Promise<void>;
  startTrial: (tier: TierId, cycle: 'monthly' | 'annual') => Promise<Result>;
  cancelMembership: () => Promise<Result>;
}

const Ctx = createContext<AuthCtx | null>(null);

const friendly = (msg: string) =>
  /invalid login/i.test(msg) ? 'That email and password don’t match an account.'
    : /already registered|already exists/i.test(msg) ? 'An account with that email already exists. Sign in instead.'
    : /provider is not enabled|unsupported provider/i.test(msg) ? 'That sign-in method isn’t switched on yet. Use email and password.'
    : /email not confirmed/i.test(msg) ? 'Confirm your email first. Check your inbox for the link.'
    : /failed to fetch|network|load failed/i.test(msg) ? 'Can’t reach the account service right now. Check your connection and try again.'
    : msg;

export function AuthProvider({ children }: { children: ReactNode }) {
  const sb = supabase();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(!sb);

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

  const value = useMemo<AuthCtx>(() => {
    const none = { error: 'Accounts are not connected yet.' };
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const trialExpired = !!profile && profile.plan !== 'free' && !!profile.trialEndsAt && Date.parse(profile.trialEndsAt) < Date.now();
    return {
      configured: !!sb, ready, user, profile,
      effectivePlan: profile && !trialExpired ? profile.plan : 'free',
      trialExpired,
      signUp: async (email, password, name) => {
        if (!sb) return { ...none, needsConfirmation: false };
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: `${origin}/account` } });
        return { error: error ? friendly(error.message) : null, needsConfirmation: !error && !data.session };
      },
      signIn: async (email, password) => {
        if (!sb) return none;
        const { error } = await sb.auth.signInWithPassword({ email, password });
        return { error: error ? friendly(error.message) : null };
      },
      signInWithProvider: async provider => {
        if (!sb) return none;
        const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: `${origin}/account` } });
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
  }, [sb, ready, user, profile, loadProfile]);

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
