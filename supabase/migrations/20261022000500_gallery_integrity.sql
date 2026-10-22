-- Phase 2c: gallery and badge integrity.
--   * Sightings qualify for badges on the server's own reading of the OVATION model, not the app's score.
--   * Reports: none on your own photos, 20 a day, and only accounts 3 days old count toward the automatic hide.
--   * Gallery uploads: <user id>/<uuid>.jpg or _t.jpg only, at most 24 files a day, each file used by one photo.
--   * Files with no live photo are cleared daily by the site (/api/gallery/cleanup), which uses the storage API.
set lock_timeout = '5s';

-- ---------------------------------------------------------------------------------------------------
-- Sightings checked against the model

alter table public.sightings add column if not exists model smallint check (model between 0 and 100);
comment on column public.sightings.model is 'Best OVATION probability within 6° poleward when it was reported, read by the server (award_sightings).';

-- The best OVATION probability within 6° poleward of a place (what the forecast calls "nearby"), from the
-- snapshot in force at p_at. Null when no snapshot with a grid covers that time (grids are kept about a day).
create or replace function public.ovation_nearby(p_lat double precision, p_lon double precision, p_at timestamptz)
returns smallint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g bytea;
  lo integer := ((round(p_lon)::integer % 360) + 360) % 360;
  dir integer := case when p_lat >= 0 then 1 else -1 end;
  best integer := 0;
  row_ integer;
begin
  select decode(o.grid, 'base64') into g from public.ovation_snapshots o
    where o.grid is not null and coalesce(o.observation_time, o.forecast_time) <= p_at
      and coalesce(o.observation_time, o.forecast_time) > p_at - interval '2 hours'
    order by coalesce(o.observation_time, o.forecast_time) desc limit 1;
  if g is null or length(g) <> 181 * 360 then return null; end if;
  for d in 0..6 loop
    row_ := least(180, greatest(0, round(p_lat + dir * d)::integer + 90));
    best := greatest(best, get_byte(g, row_ * 360 + lo));
  end loop;
  return best;
end;
$$;
revoke execute on function public.ovation_nearby(double precision, double precision, timestamptz) from public, anon, authenticated;

create or replace function public.award_sightings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  kp real;
  day_max real;
  nearby integer;
  seen smallint;
  earlier integer;
  home record;
  d double precision;
  mon integer;
  north boolean;
  season text;
  n integer := 0;
  touched uuid[] := '{}';
begin
  for s in
    select * from public.sightings x
    where x.awarded_at is null and x.created_at < now() - interval '1 hour'
    order by x.created_at
    limit 500
  loop
    update public.sightings set awarded_at = now() where id = s.id;
    select count(*) filter (where o.created_at <= s.created_at), count(*) into earlier, nearby
      from public.sightings o
      where o.user_id <> s.user_id
        and o.created_at between s.created_at - interval '1 hour' and s.created_at + interval '1 hour'
        and public.km_between(s.lat, s.lon, o.lat, o.lon) <= 50;
    seen := public.ovation_nearby(s.lat, s.lon, s.created_at);
    update public.sightings set model = seen where id = s.id;
    -- Counted when someone else saw it too, or the OVATION model put aurora within reach of the sky (10% or more).
    -- The score the reporter's app sent is kept for checking the forecast, never for awards.
    if nearby = 0 and coalesce(seen, 0) < 10 then continue; end if;

    n := n + 1;
    touched := array_append(touched, s.user_id);
    kp := public.kp_at(s.created_at);
    perform public.award(s.user_id, 'report', s.id::text, 20, kp, s.created_at);
    if earlier > 0 then perform public.award(s.user_id, 'corroborate', s.id::text, 10, null, s.created_at); end if;

    -- Kp thresholds count the "minus" values (Kp 5- is 4.67).
    if kp >= 4.66 then perform public.award(s.user_id, 'kp5', 'once', 25, kp, s.created_at); end if;
    if kp >= 6.66 then perform public.award(s.user_id, 'kp7', 'once', 50, kp, s.created_at); end if;
    if kp >= 8.66 then perform public.award(s.user_id, 'kp9', 'once', 100, kp, s.created_at); end if;

    select max(k.kp) into day_max from public.kp_index k
      where k.time_tag >= date_trunc('day', s.created_at at time zone 'UTC') at time zone 'UTC'
        and k.time_tag < (date_trunc('day', s.created_at at time zone 'UTC') + interval '1 day') at time zone 'UTC'
        and coalesce(k.status, '') <> 'predicted';
    -- A storm day (G3 or stronger) is a limited-edition badge of its own.
    if day_max >= 6.66 then
      perform public.award(s.user_id, 'storm', to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD'), 25, day_max, s.created_at);
    end if;
    if day_max >= 4.66 and not exists (
      select 1 from public.sightings o
      where o.id <> s.id and o.created_at < s.created_at and o.created_at > s.created_at - interval '12 hours'
        and public.km_between(s.lat, s.lon, o.lat, o.lon) <= 500
    ) then
      perform public.award(s.user_id, 'first_light', s.id::text, 30, null, s.created_at);
    end if;

    -- Furthest from the pole: the lowest latitude (either hemisphere) aurora was confirmed at.
    insert into public.achievements (user_id, kind, ref, at, value, points)
      values (s.user_id, 'south', 'best', s.created_at, abs(s.lat), 0)
      on conflict (user_id, kind, ref) do update set value = least(public.achievements.value, excluded.value),
        at = case when excluded.value < public.achievements.value then excluded.at else public.achievements.at end;
    perform public.award(s.user_id, 'place', floor(s.lat)::int || ':' || floor(s.lon)::int, 5, null, s.created_at);

    select l.lat, l.lon into home from public.locations l where l.user_id = s.user_id and l.is_home limit 1;
    if found then
      d := public.km_between(home.lat, home.lon, s.lat, s.lon);
      if d > 100 then perform public.award(s.user_id, 'road_trip', s.id::text, 10, d::real, s.created_at); end if;
    end if;

    -- A night runs from noon to noon UTC, so one evening's reports count once.
    perform public.award(s.user_id, 'night', to_char((s.created_at - interval '12 hours') at time zone 'UTC', 'YYYY-MM-DD'), 0, null, s.created_at);

    mon := extract(month from s.created_at at time zone 'UTC');
    north := s.lat >= 0;
    if s.created_at between make_timestamptz(extract(year from s.created_at)::int, 3, 20, 12, 0, 0, 'UTC') - interval '21 days'
                           and make_timestamptz(extract(year from s.created_at)::int, 3, 20, 12, 0, 0, 'UTC') + interval '21 days' then
      perform public.award(s.user_id, 'equinox', extract(year from s.created_at)::int || (case when north then '-spring' else '-autumn' end), 10, null, s.created_at);
    elsif s.created_at between make_timestamptz(extract(year from s.created_at)::int, 9, 22, 12, 0, 0, 'UTC') - interval '21 days'
                              and make_timestamptz(extract(year from s.created_at)::int, 9, 22, 12, 0, 0, 'UTC') + interval '21 days' then
      perform public.award(s.user_id, 'equinox', extract(year from s.created_at)::int || (case when north then '-autumn' else '-spring' end), 10, null, s.created_at);
    end if;
    season := case when mon in (12, 1, 2) then 'winter' when mon in (3, 4, 5) then 'spring' when mon in (6, 7, 8) then 'summer' else 'autumn' end;
    if not north then
      season := case season when 'winter' then 'summer' when 'summer' then 'winter' when 'spring' then 'autumn' else 'spring' end;
    end if;
    perform public.award(s.user_id, 'season', season, 10, null, s.created_at);
  end loop;

  perform public.refresh_points(u) from unnest(touched) u group by u;
  return n;
end;
$$;
revoke execute on function public.award_sightings() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Reports

create or replace function public.report_photo(p_photo uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
  weighty integer;
  moderator boolean;
begin
  if uid is null then raise exception 'Sign in to report' using errcode = 'P0001'; end if;
  select g.user_id into owner from public.gallery_photos g where g.id = p_photo;
  if owner is null or owner = uid then return; end if;
  if (select count(*) from public.photo_reports r where r.user_id = uid and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Twenty reports a day' using errcode = 'P0001';
  end if;
  insert into public.photo_reports (photo_id, user_id, reason) values (p_photo, uid, p_reason) on conflict do nothing;
  if not found then return; end if;
  moderator := exists (select 1 from public.admins a where a.user_id = uid);
  -- New accounts' reports are kept for the moderator but don't hide a photo on their own.
  select count(*) into weighty from public.photo_reports r join auth.users u on u.id = r.user_id
    where r.photo_id = p_photo and u.created_at < now() - interval '3 days';
  update public.gallery_photos set reports = reports + 1,
    status = case when status = 'visible' and (moderator or weighty >= 3) then 'hidden' else status end
  where id = p_photo;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Uploads

-- Files the signed-in member has uploaded to the gallery in the last day (for the upload policy).
create or replace function public.gallery_uploads_today()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from storage.objects o
  where o.bucket_id = 'gallery' and o.name like (select auth.uid())::text || '/%' and o.created_at > now() - interval '1 day';
$$;
revoke execute on function public.gallery_uploads_today() from public, anon;
grant execute on function public.gallery_uploads_today() to authenticated;

-- Ten photos a day is 20 files; 24 leaves room for a retry.
alter policy "Members upload gallery photos to their own folder" on storage.objects
  with check (
    bucket_id = 'gallery'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\.jpg$')
    and (select public.gallery_uploads_today()) < 24
  );

-- A photo's two files are <id>.jpg and <id>_t.jpg in the poster's folder, and no other photo uses them.
create unique index if not exists gallery_photos_path on public.gallery_photos (path);
create index if not exists gallery_photos_thumb on public.gallery_photos (thumb_path);
alter table public.gallery_photos add constraint gallery_photos_files check (
  path ~ ('^' || user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
  and thumb_path = left(path, -4) || '_t.jpg'
);

-- ---------------------------------------------------------------------------------------------------
-- Leftover files

-- Gallery files more than a day old that no live photo uses: uploads never posted, files of removed
-- photos whose clean-up failed, and folders of closed accounts. The site's cleanup route clears them.
create or replace function public.gallery_orphans(p_limit integer default 500)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'gallery' and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.gallery_photos g where g.status <> 'removed' and (g.path = o.name or g.thumb_path = o.name))
  order by o.created_at
  limit least(greatest(p_limit, 1), 1000);
$$;
revoke execute on function public.gallery_orphans(integer) from public, anon, authenticated;
grant execute on function public.gallery_orphans(integer) to service_role;

select cron.schedule(
  'gallery-cleanup',
  '41 4 * * *',
  $$
  select net.http_post(
    url     := 'https://www.polarlights.io/api/gallery/cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alerts-key', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
