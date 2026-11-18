/**
 * Storage for automatic posting: the social_settings row, the social_event_posts log and the Bluesky
 * session in Vault. Server only (service role). `memoryStore` is the same interface in memory, for tests.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SOCIAL_RULES, type SocialEvent, type SocialRules, type ViewingSite } from './socialEvents';
import type { Session } from './bluesky';

export interface SocialSettings extends SocialRules {
  /** Viewing outlooks for the sites in social_sites (socialViewing). */
  viewingEnabled: boolean;
  handle: string | null;
  did: string | null;
  service: string | null;
  connectedAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
}

/** 'deleting': an administrator asked for the post to be removed from Bluesky; 'deleted': it has been. */
export type PostStatus = 'posting' | 'posted' | 'failed' | 'deleting' | 'deleted';
export interface EventPostRow {
  key: string;
  kind: SocialEvent['kind'];
  status: PostStatus;
  error: string | null;
  post_uri: string | null;
  post_url: string | null;
  text: string | null;
  alt: string | null;
  image: boolean;
  manual: boolean;
  event_at: string;
  data: Partial<SocialEvent> | null;
  created_at: string;
}

export interface SocialStore {
  settings(): Promise<SocialSettings>;
  updateSettings(patch: Record<string, unknown>): Promise<void>;
  session(): Promise<Session | null>;
  saveSession(s: Session | null): Promise<void>;
  /** Non-failed and failed posts created since `since` (ms), newest first. */
  recent(since: number, limit?: number): Promise<EventPostRow[]>;
  /** Insert a 'posting' row for this key; false if the key is already taken (someone else has it). */
  claim(row: Pick<EventPostRow, 'key' | 'kind' | 'event_at' | 'data' | 'manual'> & { posted_by?: string | null }): Promise<boolean>;
  finish(key: string, patch: Partial<EventPostRow>): Promise<void>;
  /** Remove a claim (image not ready yet, or a failed post being retried by hand). */
  release(key: string): Promise<void>;
  /** Rows waiting to be deleted from Bluesky. */
  deleting(): Promise<EventPostRow[]>;
  /** Sites for viewing outlooks, oldest first. */
  sites(): Promise<ViewingSite[]>;
  addSite(site: Omit<ViewingSite, 'id'>, by?: string | null): Promise<ViewingSite>;
  removeSite(id: string): Promise<void>;
}

type Row = Record<string, unknown>;
const toSettings = (r: Row | null): SocialSettings => ({
  enabled: !!r?.events_enabled,
  stormMinG: typeof r?.storm_min_g === 'number' ? r.storm_min_g : DEFAULT_SOCIAL_RULES.stormMinG,
  flareMin: (r?.flare_min as SocialRules['flareMin']) ?? DEFAULT_SOCIAL_RULES.flareMin,
  shocks: r?.shocks_enabled === undefined ? DEFAULT_SOCIAL_RULES.shocks : !!r.shocks_enabled,
  substorms: !!r?.substorms_enabled,
  viewingEnabled: !!r?.viewing_enabled,
  handle: (r?.handle as string) ?? null,
  did: (r?.did as string) ?? null,
  service: (r?.service as string) ?? null,
  connectedAt: (r?.connected_at as string) ?? null,
  lastError: (r?.last_error as string) ?? null,
  updatedAt: (r?.updated_at as string) ?? null,
});

export function supabaseStore(db: SupabaseClient): SocialStore {
  const COLS = 'key, kind, status, error, post_uri, post_url, text, alt, image, manual, event_at, data, created_at';
  return {
    async settings() {
      const { data, error } = await db.from('social_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw new Error(`social_settings: ${error.message}`);
      return toSettings(data);
    },
    async updateSettings(patch) {
      const { error } = await db.from('social_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
      if (error) throw new Error(`social_settings: ${error.message}`);
    },
    async session() {
      const { data, error } = await db.rpc('bluesky_session_get');
      if (error) throw new Error(`bluesky_session_get: ${error.message}`);
      return (data as Session | null) ?? null;
    },
    async saveSession(s) {
      const { error } = await db.rpc('bluesky_session_set', { s });
      if (error) throw new Error(`bluesky_session_set: ${error.message}`);
    },
    async recent(since, limit = 50) {
      const { data, error } = await db.from('social_event_posts').select(COLS).gte('created_at', new Date(since).toISOString()).order('created_at', { ascending: false }).limit(limit);
      if (error) throw new Error(`social_event_posts: ${error.message}`);
      return (data ?? []) as EventPostRow[];
    },
    async claim(row) {
      const { error } = await db.from('social_event_posts').insert({ ...row, status: 'posting' });
      if (!error) return true;
      if (error.code === '23505') return false;
      throw new Error(`social_event_posts: ${error.message}`);
    },
    async finish(key, patch) {
      const { error } = await db.from('social_event_posts').update({ ...patch, updated_at: new Date().toISOString() }).eq('key', key);
      if (error) throw new Error(`social_event_posts: ${error.message}`);
    },
    async release(key) {
      const { error } = await db.from('social_event_posts').delete().eq('key', key);
      if (error) throw new Error(`social_event_posts: ${error.message}`);
    },
    async deleting() {
      const { data, error } = await db.from('social_event_posts').select(COLS).eq('status', 'deleting').limit(20);
      if (error) throw new Error(`social_event_posts: ${error.message}`);
      return (data ?? []) as EventPostRow[];
    },
    async sites() {
      const { data, error } = await db.from('social_sites').select('id, name, lat, lon, tags').order('created_at');
      if (error) throw new Error(`social_sites: ${error.message}`);
      return (data ?? []) as ViewingSite[];
    },
    async addSite(site, by) {
      const { data, error } = await db.from('social_sites').insert({ ...site, created_by: by ?? null }).select('id, name, lat, lon, tags').single();
      if (error) throw new Error(`social_sites: ${error.message}`);
      return data as ViewingSite;
    },
    async removeSite(id) {
      const { error } = await db.from('social_sites').delete().eq('id', id);
      if (error) throw new Error(`social_sites: ${error.message}`);
    },
  };
}

/** The same store in memory (tests and local runs). */
export function memoryStore(init: { settings?: Row; session?: Session | null; posts?: EventPostRow[]; sites?: ViewingSite[] } = {}): SocialStore & { rows: EventPostRow[]; raw: Row; sess: Session | null; siteList: ViewingSite[] } {
  const raw: Row = { events_enabled: false, storm_min_g: 1, flare_min: 'X', shocks_enabled: true, substorms_enabled: false, ...init.settings };
  const rows: EventPostRow[] = [...(init.posts ?? [])];
  const siteList: ViewingSite[] = [...(init.sites ?? [])];
  const st = {
    rows, raw, siteList, sess: init.session ?? null,
    async settings() { return toSettings(raw); },
    async updateSettings(patch: Row) { Object.assign(raw, patch, { updated_at: new Date().toISOString() }); },
    async session() { return st.sess; },
    async saveSession(s: Session | null) { st.sess = s; },
    async recent(since: number, limit = 50) { return rows.filter(r => Date.parse(r.created_at) >= since).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit); },
    async claim(row: Pick<EventPostRow, 'key' | 'kind' | 'event_at' | 'data' | 'manual'>) {
      if (rows.some(r => r.key === row.key)) return false;
      rows.push({ status: 'posting', error: null, post_uri: null, post_url: null, text: null, alt: null, image: false, created_at: new Date().toISOString(), ...row });
      return true;
    },
    async finish(key: string, patch: Partial<EventPostRow>) { const r = rows.find(x => x.key === key); if (r) Object.assign(r, patch); },
    async release(key: string) { const i = rows.findIndex(x => x.key === key); if (i >= 0) rows.splice(i, 1); },
    async deleting() { return rows.filter(r => r.status === 'deleting'); },
    async sites() { return [...siteList]; },
    async addSite(site: Omit<ViewingSite, 'id'>) { const s = { ...site, id: `site-${siteList.length + 1}` }; siteList.push(s); return s; },
    async removeSite(id: string) { const i = siteList.findIndex(x => x.id === id); if (i >= 0) siteList.splice(i, 1); },
  };
  return st;
}
