-- Run the ingest-space-weather edge function every 10 minutes.
-- Requires two Vault secrets, created once per project:
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<publishable or anon key>', 'publishable_key');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ingest-space-weather',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/ingest-space-weather',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Keep the archive small: 1-minute solar wind for 30 days, run log for 14 days.
select cron.schedule(
  'prune-space-weather',
  '17 3 * * *',
  $$
  delete from public.solar_wind where time_tag < now() - interval '30 days';
  delete from public.ingest_runs where ran_at < now() - interval '14 days';
  $$
);
