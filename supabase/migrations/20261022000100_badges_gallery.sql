-- Badges, ranks and the community gallery.
--
-- members        public name (handle) and points of everyone who has earned something or posted a photo.
-- achievements   what each member has done (a confirmed report, a photo, a storm seen, ...): badges, tiers
--                and points are worked out from these. Kept for good, unlike sightings (30 days).
-- gallery_photos photos members post; the files are in the public `gallery` storage bucket, under the
--                poster's user id. Read through gallery_feed(), which hides blocked members and joins names.
-- photo_votes, photo_reports, member_blocks: Helpful votes, reports (three hide a photo until it is
--                reviewed) and blocks.
-- Everything is reached through the functions below or the site's server routes; the tables themselves
-- aren't readable or writable through the API, except a member's own achievements.

create table public.members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  handle     text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  points     integer not null default 0,
  -- Helpful votes received on photos.
  helpful    integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind    text not null,
  ref     text not null,
  at      timestamptz not null default now(),
  value   real,
  points  smallint not null default 0,
  primary key (user_id, kind, ref)
);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table public.gallery_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  taken_at    timestamptz not null,
  path        text not null,
  thumb_path  text not null,
  width       integer,
  height      integer,
  caption     text check (char_length(caption) <= 280),
  place       text check (char_length(place) <= 80),
  -- Rounded to 0.1° (about 10 km) or 1° (an area), or none.
  lat         real,
  lon         real,
  kp          real,
  source      text not null check (source in ('app', 'upload')),
  camera      text check (char_length(camera) <= 80),
  status      text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  featured    boolean not null default false,
  helpful     integer not null default 0,
  reports     integer not null default 0
);
create index gallery_photos_taken on public.gallery_photos (taken_at desc) where status = 'visible';
create index gallery_photos_user on public.gallery_photos (user_id, created_at desc);

create table public.photo_votes (
  photo_id   uuid not null references public.gallery_photos (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

create table public.photo_reports (
  photo_id   uuid not null references public.gallery_photos (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  reason     text not null check (reason in ('not_aurora', 'inappropriate', 'spam', 'not_theirs', 'other')),
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

create table public.member_blocks (
  user_id    uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);

alter table public.members enable row level security;
alter table public.achievements enable row level security;
alter table public.admins enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.photo_votes enable row level security;
alter table public.photo_reports enable row level security;
alter table public.member_blocks enable row level security;
revoke all on public.members, public.achievements, public.admins, public.gallery_photos, public.photo_votes, public.photo_reports, public.member_blocks from anon, authenticated;

create policy "Members read their own achievements" on public.achievements
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.achievements to authenticated;

-- Sightings are awarded once, an hour after they're made (when others nearby have had time to report).
alter table public.sightings add column awarded_at timestamptz;

-- ---------------------------------------------------------------------------------------------------
-- Members and points

-- The member row for a user, made with a generated name the first time it's needed.
create or replace function public.ensure_member(p_user uuid)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.members;
begin
  select * into m from public.members where user_id = p_user;
  if found then return m; end if;
  loop
    begin
      insert into public.members (user_id, handle)
        values (p_user, 'watcher_' || substr(md5(random()::text || p_user::text), 1, 6))
        returning * into m;
      return m;
    exception when unique_violation then
      select * into m from public.members where user_id = p_user;
      if found then return m; end if;
    end;
  end loop;
end;
$$;

create or replace function public.refresh_points(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.members m set points =
    coalesce((select sum(a.points) from public.achievements a where a.user_id = p_user), 0) + m.helpful
  where m.user_id = p_user;
$$;

-- An achievement (ignored when already earned), and the points it brings.
create or replace function public.award(p_user uuid, p_kind text, p_ref text, p_points integer, p_value real default null, p_at timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_member(p_user);
  insert into public.achievements (user_id, kind, ref, at, value, points) values (p_user, p_kind, p_ref, p_at, p_value, p_points)
    on conflict do nothing;
  return found;
end;
$$;

-- The signed-in member: name, points, helpful votes received, and whether they moderate the gallery.
create or replace function public.my_member()
returns table (handle text, points integer, helpful integer, is_admin boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.members;
begin
  if auth.uid() is null then return; end if;
  m := public.ensure_member(auth.uid());
  return query select m.handle, m.points, m.helpful, exists (select 1 from public.admins a where a.user_id = auth.uid());
end;
$$;

-- Change the gallery name: 3–20 lower-case letters, digits or _. Returns 'ok', 'invalid' or 'taken'.
create or replace function public.set_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return 'invalid'; end if;
  p_handle := lower(trim(p_handle));
  if p_handle !~ '^[a-z0-9_]{3,20}$' then return 'invalid'; end if;
  perform public.ensure_member(auth.uid());
  begin
    update public.members set handle = p_handle where user_id = auth.uid();
  exception when unique_violation then
    return 'taken';
  end;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Awarding sightings

-- Kp at a time: the highest measured value for its 3-hour period (saved by the ingest job).
create or replace function public.kp_at(p_at timestamptz)
returns real
language sql
stable
security definer
set search_path = ''
as $$
  select max(k.kp) from public.kp_index k
  where k.time_tag <= p_at and k.time_tag > p_at - interval '3 hours'
    and coalesce(k.status, '') <> 'predicted';
$$;

create or replace function public.km_between(a_lat double precision, a_lon double precision, b_lat double precision, b_lon double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371 * asin(sqrt(sin(radians(b_lat - a_lat) / 2) ^ 2 + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(radians(b_lon - a_lon) / 2) ^ 2));
$$;

-- Every sighting more than an hour old is checked once. It's confirmed when another member reported
-- aurora within 50 km and an hour of it, or the verdict shown when it was reported gave a real chance
-- (score 20 or more). Confirmed sightings earn: a report; a corroboration when someone nearby reported
-- first; Kp 5 / 7 / 9 and storm-day badges; First Light (the first report within 500 km on a storm
-- day); a place; a road trip (over 100 km from Home); a night; equinox and season-of-the-year marks.
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
    if nearby = 0 and coalesce(s.score, 0) < 20 then continue; end if;

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

select cron.schedule('award-sightings', '*/15 * * * *', $$ select public.award_sightings(); $$);

-- ---------------------------------------------------------------------------------------------------
-- Gallery

-- Post a photo whose files the member has uploaded to gallery/<their id>/. At most 10 a day.
create or replace function public.post_photo(
  p_path text, p_thumb text, p_width integer, p_height integer, p_caption text, p_place text,
  p_lat double precision, p_lon double precision, p_precision text, p_taken_at timestamptz, p_source text, p_camera text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  id uuid;
  step double precision;
  taken timestamptz;
begin
  if uid is null then raise exception 'Sign in to post' using errcode = 'P0001'; end if;
  if split_part(p_path, '/', 1) <> uid::text or split_part(p_thumb, '/', 1) <> uid::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'gallery' and o.name = p_path)
     or not exists (select 1 from storage.objects o where o.bucket_id = 'gallery' and o.name = p_thumb) then
    raise exception 'Upload the photo first' using errcode = 'P0001';
  end if;
  if (select count(*) from public.gallery_photos g where g.user_id = uid and g.created_at > now() - interval '1 day') >= 10 then
    raise exception 'Ten photos a day' using errcode = 'P0001';
  end if;
  perform public.ensure_member(uid);
  taken := least(now(), greatest(coalesce(p_taken_at, now()), now() - interval '30 days'));

  if p_precision = 'none' or p_lat is null or p_lon is null then
    p_lat := null; p_lon := null; p_place := null;
  elsif p_precision = 'area' then
    p_lat := round(p_lat::numeric); p_lon := round(p_lon::numeric);
  else
    p_lat := round(p_lat::numeric, 1);
    step := least(10, 0.1 / greatest(cos(radians(p_lat)), 0.01));
    p_lon := round((p_lon / step)::numeric) * step;
  end if;

  insert into public.gallery_photos (user_id, taken_at, path, thumb_path, width, height, caption, place, lat, lon, kp, source, camera)
    values (uid, taken, p_path, p_thumb, p_width, p_height, nullif(trim(p_caption), ''), nullif(trim(p_place), ''), p_lat, p_lon,
            public.kp_at(taken), case when p_source = 'app' then 'app' else 'upload' end, nullif(trim(p_camera), ''))
    returning gallery_photos.id into id;

  perform public.award(uid, 'photo', id::text, 10);
  -- Field notes: a caption, a place and the camera's settings.
  if nullif(trim(p_caption), '') is not null and p_place is not null and nullif(trim(p_camera), '') is not null then
    perform public.award(uid, 'fieldnote', id::text, 5);
  end if;
  perform public.refresh_points(uid);
  return id;
end;
$$;

-- Photos for the gallery, newest first (Top: most helpful first).
--   tonight  the last 18 hours        storm  taken at Kp 5 or more in the last 7 days
--   near     within 500 km of p_lat/p_lon in the last 30 days        top  the last 30 days
--   around   within 12 hours of p_at   mine  the member's own (hidden ones too)   one  just p_id
create or replace function public.gallery_feed(
  p_filter text default 'tonight', p_lat double precision default null, p_lon double precision default null,
  p_at timestamptz default null, p_id uuid default null, p_before timestamptz default null, p_limit integer default 30)
returns table (
  id uuid, taken_at timestamptz, path text, thumb_path text, width integer, height integer, caption text, place text,
  lat real, lon real, kp real, source text, camera text, featured boolean, helpful integer, status text,
  handle text, points integer, voted boolean, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.taken_at, g.path, g.thumb_path, g.width, g.height, g.caption, g.place, g.lat, g.lon, g.kp, g.source, g.camera,
         g.featured, g.helpful, g.status, m.handle, m.points,
         exists (select 1 from public.photo_votes v where v.photo_id = g.id and v.user_id = auth.uid()),
         g.user_id = auth.uid()
  from public.gallery_photos g
  join public.members m on m.user_id = g.user_id
  where (case when p_filter = 'mine' then g.user_id = auth.uid() and g.status <> 'removed' else g.status = 'visible' end)
    and not exists (select 1 from public.member_blocks b where b.user_id = auth.uid() and b.blocked_id = g.user_id)
    and (p_before is null or g.taken_at < p_before)
    and case p_filter
      when 'tonight' then g.taken_at > now() - interval '18 hours'
      when 'storm' then g.kp >= 4.66 and g.taken_at > now() - interval '7 days'
      when 'near' then g.lat is not null and p_lat is not null and g.taken_at > now() - interval '30 days'
        and public.km_between(p_lat, p_lon, g.lat, g.lon) <= 500
      when 'top' then g.taken_at > now() - interval '30 days'
      when 'around' then p_at is not null and g.taken_at between p_at - interval '12 hours' and p_at + interval '12 hours' and (p_id is null or g.id <> p_id)
      when 'one' then g.id = p_id
      else true
    end
  order by case when p_filter = 'top' then g.helpful else 0 end desc, g.featured desc, g.taken_at desc
  limit least(greatest(p_limit, 1), 60);
$$;

-- Helpful votes are added and removed by the site's server (/api/gallery/vote), which then recounts
-- them here for the photo and its owner.
create or replace function public.recount_helpful(p_photo uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  total integer;
begin
  update public.gallery_photos g set helpful = (select count(*) from public.photo_votes v where v.photo_id = g.id)
    where g.id = p_photo returning g.user_id, g.helpful into owner, total;
  if owner is null then return 0; end if;
  update public.members m set helpful = coalesce((select sum(g.helpful) from public.gallery_photos g where g.user_id = owner and g.status <> 'removed'), 0)
    where m.user_id = owner;
  perform public.refresh_points(owner);
  return total;
end;
$$;

-- Report a photo. Three reports hide it until a moderator looks at it.
create or replace function public.report_photo(p_photo uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to report' using errcode = 'P0001'; end if;
  insert into public.photo_reports (photo_id, user_id, reason) values (p_photo, auth.uid(), p_reason) on conflict do nothing;
  if found then
    update public.gallery_photos set reports = reports + 1,
      status = case when status = 'visible' and reports + 1 >= 3 then 'hidden' else status end
    where id = p_photo;
  end if;
end;
$$;

-- Block whoever posted a photo: their photos no longer show for the member.
create or replace function public.block_photo_owner(p_photo uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select g.user_id into owner from public.gallery_photos g where g.id = p_photo;
  if auth.uid() is null or owner is null or owner = auth.uid() then return; end if;
  insert into public.member_blocks (user_id, blocked_id) values (auth.uid(), owner) on conflict do nothing;
end;
$$;

create or replace function public.my_blocks()
returns table (handle text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.handle from public.member_blocks b join public.members m on m.user_id = b.blocked_id
  where b.user_id = auth.uid() order by m.handle;
$$;

-- Who may run which function: everything here acts as auth.uid(); the helpers are internal. Removing a
-- vote, unblocking, removing one's own photo and moderating are done by the site's server routes.
revoke execute on function public.ensure_member(uuid), public.refresh_points(uuid), public.award(uuid, text, text, integer, real, timestamptz),
  public.award_sightings(), public.kp_at(timestamptz), public.recount_helpful(uuid) from public, anon, authenticated;
revoke execute on function public.my_member(), public.set_handle(text), public.post_photo(text, text, integer, integer, text, text, double precision, double precision, text, timestamptz, text, text),
  public.report_photo(uuid, text), public.block_photo_owner(uuid), public.my_blocks(),
  public.gallery_feed(text, double precision, double precision, timestamptz, uuid, timestamptz, integer) from public;
grant execute on function public.my_member(), public.set_handle(text), public.post_photo(text, text, integer, integer, text, text, double precision, double precision, text, timestamptz, text, text),
  public.report_photo(uuid, text), public.block_photo_owner(uuid), public.my_blocks() to authenticated;
grant execute on function public.gallery_feed(text, double precision, double precision, timestamptz, uuid, timestamptz, integer) to anon, authenticated;
grant execute on function public.recount_helpful(uuid), public.award(uuid, text, text, integer, real, timestamptz), public.refresh_points(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------
-- Storage: public photos, each member uploading only into their own folder. JPEG only, at most 5 MB.
-- Files are removed by the site's server (own photos, moderation, account deletion).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('gallery', 'gallery', true, 5242880, array['image/jpeg'])
  on conflict (id) do nothing;

create policy "Members upload gallery photos to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = (select auth.uid())::text);
