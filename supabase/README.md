# Supabase

Database for Polar Lights: saved locations and alert settings (per user, row-level
security) plus a public archive of space-weather data.

## Status (production project `polarlights-core`, ref `uicfvlmmjdttpcglxhdh`, eu-north-1)

| Step | State |
| --- | --- |
| Core schema (`core_schema`) | Applied; 11 live checks pass (sign-up profile, location limits, trial, RLS isolation, public archive) |
| `pg_cron` + `pg_net` (`enable_cron_and_net`) | Applied |
| `ingest-space-weather` edge function | Deployed (v1, JWT verification on); a manual run stored Kp, GFZ Kp, solar wind and OVATION |
| Vault secrets `project_url`, `publishable_key` | Stored |
| Cron jobs (`20261017000200_ingest_schedule.sql`) | **Pending**: `cron.schedule()` times out through the MCP connector; run the file in the SQL Editor |
| Auth URL configuration | **Pending**: dashboard only (step 5 below) |
| Vercel env vars | Added by the Vercel ↔ Supabase integration |

## Contents

- `migrations/20261017000100_core_schema.sql`: tables, RLS policies, `set_home_location()`
- `migrations/20261017000150_enable_cron_and_net.sql`: pg_cron and pg_net
- `migrations/20261017000200_ingest_schedule.sql`: pg_cron jobs (ingest every 10 min, nightly prune)
- `functions/ingest-space-weather/`: edge function that pulls NOAA SWPC Kp, solar wind and
  OVATION, and GFZ Potsdam Kp, into the archive tables

## One-time setup

1. Create the project (Vercel → Storage → Supabase, connected to the `aurora-monitor`
   Vercel project, so `NEXT_PUBLIC_SUPABASE_URL` and the anon key are added automatically).
2. Apply `20261017000100_core_schema.sql`.
3. Deploy the `ingest-space-weather` function.
4. Store the two Vault secrets the schedule uses, then apply `20261017000200_ingest_schedule.sql`:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<anon or publishable key>', 'publishable_key');
   ```
5. Authentication → URL Configuration: set the Site URL to `https://www.polarlights.io` and add
   `https://www.polarlights.io/**` and `https://aurora-monitor*-crucible-insight.vercel.app/**`
   to Redirect URLs (used by email confirmation, password reset and OAuth).
6. Optional: Authentication → Sign In / Providers → enable Google and Apple (each needs
   OAuth credentials from Google Cloud / Apple Developer). Until then those buttons explain
   that the method isn't switched on.

## Accounts

- Email and password sign-up (with email confirmation), sign-in, password reset.
- `profiles` row created by trigger on sign-up. Users can edit only `display_name`;
  `start_trial()` and `cancel_membership()` change the plan. A paid tier applies while
  `trial_ends_at` is in the future; there is one trial per account and no card payments yet.
- `locations` and `alert_settings` belong to the signed-in user (RLS). Locations saved in
  the browser while signed out are moved into the account at the next sign-in.

Until the project is connected, the app runs in demo mode: sign-in is simulated and
locations are kept in the browser.
