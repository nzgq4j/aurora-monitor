-- Automatic Bluesky posting (@polarlights.io): settings, the event post log, the Bluesky session in Vault,
-- and a one-minute schedule that calls /api/cron/social with a single-use ticket.
-- Everything here is server-only: RLS on with no policies, functions callable by the service role only.

-- ---- Settings (one row) ----
create table public.social_settings (
  id                smallint primary key default 1 check (id = 1),
  -- Connection status (not secret; the tokens are in Vault)
  handle            text,
  did               text,
  service           text,
  connected_at      timestamptz,
  connected_by      uuid references auth.users (id) on delete set null,
  last_error        text,
  -- Event feed rules
  events_enabled    boolean not null default false,
  storm_min_g       smallint not null default 1 check (storm_min_g between 0 and 5),
  flare_min         text not null default 'X' check (flare_min in ('X', 'M5', 'off')),
  shocks_enabled    boolean not null default true,
  substorms_enabled boolean not null default false,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null
);
insert into public.social_settings (id) values (1);

-- ---- Event post log: one row per event, claimed ('posting') before Bluesky is called ----
create table public.social_event_posts (
  id          bigint generated always as identity primary key,
  key         text not null unique,
  kind        text not null check (kind in ('storm', 'flare', 'shock', 'substorm')),
  status      text not null check (status in ('posting', 'posted', 'failed')),
  error       text,
  post_uri    text,
  post_url    text,
  text        text,
  alt         text,
  image       boolean not null default false,
  manual      boolean not null default false,
  posted_by   uuid references auth.users (id) on delete set null,
  event_at    timestamptz not null,
  data        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index social_event_posts_recent on public.social_event_posts (created_at desc);
create index social_event_posts_kind on public.social_event_posts (kind, created_at desc);
create index social_event_posts_posted_by on public.social_event_posts (posted_by);
create index social_settings_connected_by on public.social_settings (connected_by);
create index social_settings_updated_by on public.social_settings (updated_by);

alter table public.social_settings enable row level security;
alter table public.social_event_posts enable row level security;
revoke all on public.social_settings, public.social_event_posts from anon, authenticated;

-- ---- Bluesky session tokens in Vault (never the password) ----
create or replace function public.bluesky_session_get()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'bluesky_session' limit 1;
$$;

create or replace function public.bluesky_session_set(s jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = 'bluesky_session';
  if s is null then
    if sid is not null then delete from vault.secrets where id = sid; end if;
  elsif sid is null then
    perform vault.create_secret(s::text, 'bluesky_session', 'Bluesky session tokens for automatic posting');
  else
    perform vault.update_secret(sid, s::text);
  end if;
end;
$$;

revoke execute on function public.bluesky_session_get(), public.bluesky_session_set(jsonb) from public, anon, authenticated;
grant execute on function public.bluesky_session_get(), public.bluesky_session_set(jsonb) to service_role;

-- ---- Single-use cron tickets ----
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.cron_tickets (
  token      uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- True once for a ticket under 2 minutes old (it is deleted); old tickets are pruned on the way.
create or replace function public.consume_cron_ticket(t uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare found_one boolean;
begin
  delete from private.cron_tickets where created_at < now() - interval '10 minutes';
  delete from private.cron_tickets where token = t and created_at > now() - interval '2 minutes' returning true into found_one;
  return coalesce(found_one, false);
end;
$$;
revoke execute on function public.consume_cron_ticket(uuid) from public, anon, authenticated;
grant execute on function public.consume_cron_ticket(uuid) to service_role;

select cron.schedule(
  'social-posting',
  '* * * * *',
  $$
  delete from private.cron_tickets where created_at < now() - interval '10 minutes';
  with t as (insert into private.cron_tickets default values returning token)
  select net.http_post(
    url     := 'https://www.polarlights.io/api/cron/social',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-ticket', t.token::text),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) from t;
  $$
);
