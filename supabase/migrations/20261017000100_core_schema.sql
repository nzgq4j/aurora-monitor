-- Polar Lights core schema: user profiles, locations and alert settings (private,
-- row-level security), plus a public archive of space-weather data written
-- only by the ingest-space-weather edge function (service role).

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, created automatically on sign-up)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text check (display_name is null or char_length(display_name) <= 80),
  plan           text not null default 'free' check (plan in ('free', 'chaser')),
  billing_cycle  text not null default 'annual' check (billing_cycle in ('monthly', 'annual')),
  -- Set once, the first time a paid trial starts; switching tiers keeps the same end date.
  trial_ends_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.profiles.plan is 'Tier chosen by the user. Paid tiers apply while trial_ends_at is in the future (no payments yet).';

alter table public.profiles enable row level security;

create policy "Users read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Users update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Users may only change their display name directly; plan fields change through the functions below.
revoke update on public.profiles from authenticated, anon;
grant update (display_name, updated_at) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Start (or switch tiers within) the one free 14-day trial.
create or replace function public.start_trial(tier text, cycle text default 'annual')
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  if (select auth.uid()) is null then raise exception 'Not signed in'; end if;
  if tier not in ('chaser') then raise exception 'Unknown tier %', tier; end if;
  if cycle not in ('monthly', 'annual') then raise exception 'Unknown billing cycle %', cycle; end if;
  select * into me from public.profiles where id = (select auth.uid()) for update;
  if me.trial_ends_at is not null and me.trial_ends_at < now() then
    raise exception 'Your free trial has already been used';
  end if;
  update public.profiles
     set plan = tier, billing_cycle = cycle,
         trial_ends_at = coalesce(trial_ends_at, now() + interval '14 days'),
         updated_at = now()
   where id = (select auth.uid())
  returning * into me;
  return me;
end;
$$;

create or replace function public.cancel_membership()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  if (select auth.uid()) is null then raise exception 'Not signed in'; end if;
  update public.profiles set plan = 'free', updated_at = now()
   where id = (select auth.uid())
  returning * into me;
  return me;
end;
$$;

revoke execute on function public.start_trial(text, text) from public, anon;
revoke execute on function public.cancel_membership() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.start_trial(text, text) to authenticated;
grant execute on function public.cancel_membership() to authenticated;

-- ---------------------------------------------------------------------------
-- Saved locations (manual or detected from the device)
-- ---------------------------------------------------------------------------
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  lat         double precision not null check (lat between -90 and 90),
  lon         double precision not null check (lon between -180 and 180),
  source      text not null default 'manual' check (source in ('manual', 'device')),
  is_home     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.locations is 'Places a user watches. source = device is the single auto-detected location per user.';

create index locations_user_id_idx on public.locations (user_id);
-- At most one home and one device-detected location per user.
create unique index locations_one_home_per_user on public.locations (user_id) where is_home;
create unique index locations_one_device_per_user on public.locations (user_id) where source = 'device';

alter table public.locations enable row level security;

create policy "Users read their own locations" on public.locations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add their own locations" on public.locations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own locations" on public.locations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own locations" on public.locations
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Enforce the plan's location limit (paid tiers count only while their trial is active).
create or replace function public.enforce_location_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  tier text;
  max_locations int;
  current_count int;
begin
  select * into p from public.profiles where id = new.user_id;
  tier := case when p.plan is null or p.plan = 'free' or p.trial_ends_at is null or p.trial_ends_at < now() then 'free' else p.plan end;
  max_locations := case tier when 'chaser' then 10 else 1 end;
  select count(*) into current_count from public.locations where user_id = new.user_id;
  if current_count >= max_locations then
    raise exception 'Location limit reached for the % plan (%).', tier, max_locations using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_location_limit() from public, anon, authenticated;

create trigger locations_enforce_limit
  before insert on public.locations
  for each row execute function public.enforce_location_limit();

-- Move the home flag atomically (the partial unique index forbids two homes).
create or replace function public.set_home_location(location_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.locations set is_home = false, updated_at = now()
    where user_id = (select auth.uid()) and is_home and id <> location_id;
  update public.locations set is_home = true, updated_at = now()
    where id = location_id and user_id = (select auth.uid());
end;
$$;

revoke execute on function public.set_home_location(uuid) from public, anon;
grant execute on function public.set_home_location(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Alert settings (one row per user)
-- ---------------------------------------------------------------------------
create table public.alert_settings (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  kp_threshold  smallint not null default 5 check (kp_threshold between 0 and 9),
  triggers      jsonb not null default '{"kp": true, "cme": true, "clear": true, "bz": false, "sub": false}',
  channels      jsonb not null default '{"email": true, "push": true, "sms": false}',
  updated_at    timestamptz not null default now()
);

alter table public.alert_settings enable row level security;

create policy "Users read their own alert settings" on public.alert_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own alert settings" on public.alert_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own alert settings" on public.alert_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Space-weather archive (public read; written by the service role only)
-- ---------------------------------------------------------------------------
create table public.kp_index (
  time_tag    timestamptz not null,
  source      text not null check (source in ('swpc', 'gfz')),
  kp          real not null check (kp between 0 and 9),
  status      text,            -- swpc: observed/estimated/predicted; gfz: def/nowcast
  fetched_at  timestamptz not null default now(),
  primary key (time_tag, source)
);
comment on table public.kp_index is '3-hour planetary Kp. GFZ Potsdam is the official (definitive) source; SWPC supplies estimates and forecasts.';

create table public.solar_wind (
  time_tag  timestamptz primary key,
  bz_gsm    real,
  bt        real,
  speed     real,
  density   real
);
comment on table public.solar_wind is 'Real-time L1 solar wind (DSCOVR/ACE via NOAA SWPC), 1-minute cadence, kept 30 days.';

create table public.ovation_snapshots (
  forecast_time      timestamptz primary key,
  observation_time   timestamptz,
  hemi_power_north   real,
  max_probability    smallint,
  -- Equatorward 10% edge as [[lon, lat], ...] for the northern hemisphere.
  edge               jsonb
);

create table public.ingest_runs (
  id       bigint generated always as identity primary key,
  ran_at   timestamptz not null default now(),
  ok       boolean not null,
  detail   jsonb not null default '{}'
);

alter table public.kp_index enable row level security;
alter table public.solar_wind enable row level security;
alter table public.ovation_snapshots enable row level security;
alter table public.ingest_runs enable row level security;  -- no policies: service role only

create policy "Kp archive is public" on public.kp_index for select to anon, authenticated using (true);
create policy "Solar wind archive is public" on public.solar_wind for select to anon, authenticated using (true);
create policy "Oval snapshots are public" on public.ovation_snapshots for select to anon, authenticated using (true);

create index kp_index_time_idx on public.kp_index (time_tag desc);
