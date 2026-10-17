# Supabase

Database for OVAL: saved locations and alert settings (per user, row-level
security) plus a public archive of space-weather data.

## Contents

- `migrations/20261017000100_core_schema.sql`: tables, RLS policies, `set_home_location()`
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
5. Authentication → Sign In / Providers → enable **Anonymous sign-ins**. Visitors get an
   anonymous user the first time they save a location, so their locations follow them
   across reloads without an account.

Until the project is connected, the app keeps saved locations in the browser.
