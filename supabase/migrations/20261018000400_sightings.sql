-- "I saw it" (#67): aurora sightings reported from the verdict card.
-- Privacy: the position is rounded here, in the database, to about 10 km (0.1° of latitude, and a
-- longitude step that widens towards the poles), so exact coordinates are never stored. Anyone can read
-- when and roughly where aurora was seen, never who reported it.

create table public.sightings (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  lat         real not null check (lat between -90 and 90),
  lon         real not null check (lon between -180 and 180),
  -- The verdict score (lib/tonight) shown when it was reported, to check the scoring against.
  score       smallint check (score between 0 and 100),
  brightness  text check (brightness in ('faint', 'visible', 'bright'))
);
create index sightings_recent on public.sightings (created_at desc);
create index sightings_user_recent on public.sightings (user_id, created_at desc);

-- Round the position and limit reports to one per user per 30 minutes.
-- Security definer: it reads other rows' user_id, which reporters themselves can't select.
create or replace function public.sightings_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  step double precision;
begin
  new.created_at := now();
  new.lat := round(new.lat::numeric, 1);
  -- About 11 km of longitude at any latitude (capped near the poles).
  step := least(10, 0.1 / greatest(cos(radians(new.lat)), 0.01));
  new.lon := round((new.lon / step)::numeric) * step;
  if new.lon > 180 then new.lon := new.lon - 360; end if;
  if new.lon < -180 then new.lon := new.lon + 360; end if;
  if exists (select 1 from public.sightings s where s.user_id = new.user_id and s.created_at > now() - interval '30 minutes') then
    raise exception 'One sighting per 30 minutes' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger sightings_before_insert before insert on public.sightings
  for each row execute function public.sightings_before_insert();
-- Only ever runs as the trigger; not callable through the API.
revoke execute on function public.sightings_before_insert() from public, anon, authenticated;

alter table public.sightings enable row level security;

create policy "Signed-in users report their own sightings" on public.sightings
  for insert to authenticated with check ((select auth.uid()) = user_id);
-- Brightness can be added to one's own report for 30 minutes afterwards.
create policy "Users add brightness to a recent sighting" on public.sightings
  for update to authenticated
  using ((select auth.uid()) = user_id and created_at > now() - interval '30 minutes')
  with check ((select auth.uid()) = user_id);
create policy "Recent sightings are public" on public.sightings
  for select to anon, authenticated using (created_at > now() - interval '24 hours');

-- Column privileges: user_id and score are never readable by others, only what the map needs.
revoke all on public.sightings from anon, authenticated;
grant select (id, created_at, lat, lon, brightness) on public.sightings to anon, authenticated;
grant insert (lat, lon, score) on public.sightings to authenticated;
grant update (brightness) on public.sightings to authenticated;

-- Other people's sightings within radius_km in the last `hours` (the "4 others nearby" count). Public
-- on purpose: it returns only a count, never who or exactly where.
create or replace function public.sightings_nearby(p_lat double precision, p_lon double precision, radius_km double precision default 100, hours double precision default 1)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.sightings s
  where s.created_at > now() - make_interval(secs => hours * 3600)
    and (auth.uid() is null or s.user_id <> auth.uid())
    and 2 * 6371 * asin(sqrt(
          sin(radians(s.lat - p_lat) / 2) ^ 2 +
          cos(radians(p_lat)) * cos(radians(s.lat)) * sin(radians(s.lon - p_lon) / 2) ^ 2)) <= radius_km;
$$;
revoke execute on function public.sightings_nearby(double precision, double precision, double precision, double precision) from public;
grant execute on function public.sightings_nearby(double precision, double precision, double precision, double precision) to anon, authenticated;

-- Keep 30 days of sightings for checking the scoring; the map only shows the last 3 hours.
select cron.schedule('prune-sightings', '53 3 * * *', $$ delete from public.sightings where created_at < now() - interval '30 days'; $$);
