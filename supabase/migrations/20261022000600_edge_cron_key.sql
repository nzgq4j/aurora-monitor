-- Phase 2d: the edge functions now refuse calls without pg_cron's key (the same Vault secret the alert run
-- uses, checked by check_alerts_key()). The anon JWT is still sent because the functions verify JWTs, but
-- it is public, so on its own it no longer runs them. Same schedules as before, with the key added.

select cron.schedule(
  'ingest-space-weather',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/ingest-space-weather',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'capture-sun',
  '7 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/capture-sun',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
