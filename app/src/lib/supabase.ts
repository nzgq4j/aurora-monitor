import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The Vercel Supabase integration provides these; the anon/publishable key is
// safe in the browser because every table is protected by row-level security.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** Browser Supabase client, or null when the project isn't connected yet. */
export function supabase(): SupabaseClient | null {
  if (!url || !key) return null;
  return (client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }));
}
