-- Alert engine: richer alert rules, a log of every alert decided, and a 10-minute schedule that
-- calls the site's /api/alerts/run with a key held only in Vault.

-- Rules per user (see app/src/lib/alerts.ts for the shape and defaults):
--   aurora    bool  alert when aurora reaches `level` at the user's locations
--   level     text  'faint' (camera), 'visible' (naked eye) or 'clear' (bright and vivid)
--   forecast  bool  heads-up when it's expected within the hour (Chaser)
--   storm     bool  major-storm alert when Kp reaches kp_threshold (sent even in quiet hours)
--   quiet     bool  pause aurora and heads-up alerts between quietFrom and quietTo ('HH:MM')
-- kp_threshold is the storm alert's Kp; triggers stays for the older trigger switches.
alter table public.alert_settings
  add column rules jsonb not null default '{"aurora": true, "level": "visible", "forecast": true, "storm": true, "quiet": false, "quietFrom": "23:00", "quietTo": "07:00"}',
  -- IANA zone the quiet hours are in (the browser's), e.g. 'Europe/Oslo'.
  add column time_zone text;

alter table public.alert_settings alter column kp_threshold set default 6;

-- Every alert the engine decided to send, one row per user, location and kind.
create table public.alert_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  kind        text not null check (kind in ('aurora', 'forecast', 'storm')),
  -- The level reached ('faint' | 'visible' | 'clear'), or null for storm alerts.
  level       text,
  score       smallint,
  kp          real,
  place       text,
  -- Per channel: 'sent', 'failed: …' or 'off' / 'no_provider'.
  delivery    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index alert_log_recent on public.alert_log (user_id, kind, created_at desc);

alter table public.alert_log enable row level security;
create policy "Users read their own alerts" on public.alert_log
  for select to authenticated using ((select auth.uid()) = user_id);

-- Key the scheduled job sends; generated here so it never leaves the database and Vault.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'alerts_cron_key', 'Authorises the 10-minute call to /api/alerts/run');

-- The site checks the key it receives against Vault through this function (service role only).
create or replace function public.check_alerts_key(k text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'alerts_cron_key' and decrypted_secret = k);
$$;
revoke execute on function public.check_alerts_key(text) from public, anon, authenticated;
grant execute on function public.check_alerts_key(text) to service_role;

select cron.schedule(
  'send-alerts',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://www.polarlights.io/api/alerts/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alerts-key', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Keep the log to 90 days.
select cron.schedule('prune-alert-log', '23 3 * * *', $$ delete from public.alert_log where created_at < now() - interval '90 days'; $$);
