-- Special badges: secret until earned. Three sources, all awarded as achievements of kind 'special'
-- (ref = the event's slug):
--   auto   Low Latitude and Very Low Latitude, for confirmed aurora at 55° and 48° magnetic latitude
--          or lower (award_sightings).
--   event  A named storm event: every confirmed sighting between its start and end (and, when it has
--          one, inside its region) earns it (award_sightings).
--   tour   A code given to tour guests, redeemed in the app (redeem_badge_code).
-- Names and descriptions are stored per language, so new events need no app release. How to add an
-- event or a tour and its codes: docs/special-badges.md.

create table public.special_events (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  kind text not null check (kind in ('auto', 'event', 'tour')),
  -- {"en": "...", "es": "...", ...}; English is the fallback.
  name jsonb not null check (name ? 'en'),
  description jsonb not null check (description ? 'en'),
  glyph text not null default 'star',
  starts_at timestamptz,
  ends_at timestamptz,
  lat double precision,
  lon double precision,
  radius_km real,
  points integer not null default 50 check (points between 0 and 500),
  created_at timestamptz not null default now(),
  check (kind <> 'event' or (starts_at is not null and ends_at is not null and ends_at > starts_at)),
  check ((lat is null) = (lon is null) and (lat is null) = (radius_km is null))
);

-- Codes are stored without the dash and in capitals; redeeming ignores case, spaces and dashes.
create table public.badge_codes (
  code text primary key check (code ~ '^[A-Z0-9]{6,16}$'),
  slug text not null references public.special_events (slug) on delete cascade,
  max_uses integer check (max_uses > 0),
  uses integer not null default 0,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index badge_codes_slug on public.badge_codes (slug);

-- Each redeem attempt, to limit guessing (10 an hour).
create table public.redeem_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index redeem_attempts_user_at on public.redeem_attempts (user_id, at);

-- None of these are read directly by members: the functions below hand out what they need.
alter table public.special_events enable row level security;
alter table public.badge_codes enable row level security;
alter table public.redeem_attempts enable row level security;
revoke all on public.special_events, public.badge_codes, public.redeem_attempts from anon, authenticated;

insert into public.special_events (slug, kind, glyph, points, name, description) values
('low-latitude', 'auto', 'globe', 50,
 '{"en": "Low Latitude", "es": "Latitud baja", "fr": "Basse latitude", "de": "Niedrige Breite", "nl": "Lage breedtegraad",
   "nb": "Lav breddegrad", "da": "Lav breddegrad", "sv": "Låg latitud", "fi": "Matala leveysaste", "ru": "Низкая широта"}',
 '{"en": "Confirmed aurora at 55° magnetic latitude or lower.",
   "es": "Aurora confirmada a 55° de latitud magnética o menos.",
   "fr": "Aurore confirmée à 55° de latitude magnétique ou moins.",
   "de": "Bestätigtes Polarlicht bei 55° magnetischer Breite oder weniger.",
   "nl": "Bevestigd poollicht op 55° magnetische breedte of lager.",
   "nb": "Bekreftet polarlys på 55° magnetisk breddegrad eller lavere.",
   "da": "Bekræftet polarlys på 55° magnetisk breddegrad eller lavere.",
   "sv": "Bekräftat polarsken på 55° magnetisk latitud eller lägre.",
   "fi": "Vahvistettu revontulihavainto 55° magneettisella leveysasteella tai etelämpänä.",
   "ru": "Подтверждённое полярное сияние на магнитной широте 55° или ниже."}'),
('very-low-latitude', 'auto', 'globe', 100,
 '{"en": "Very Low Latitude", "es": "Latitud muy baja", "fr": "Très basse latitude", "de": "Sehr niedrige Breite", "nl": "Zeer lage breedtegraad",
   "nb": "Svært lav breddegrad", "da": "Meget lav breddegrad", "sv": "Mycket låg latitud", "fi": "Hyvin matala leveysaste", "ru": "Очень низкая широта"}',
 '{"en": "Confirmed aurora at 48° magnetic latitude or lower.",
   "es": "Aurora confirmada a 48° de latitud magnética o menos.",
   "fr": "Aurore confirmée à 48° de latitude magnétique ou moins.",
   "de": "Bestätigtes Polarlicht bei 48° magnetischer Breite oder weniger.",
   "nl": "Bevestigd poollicht op 48° magnetische breedte of lager.",
   "nb": "Bekreftet polarlys på 48° magnetisk breddegrad eller lavere.",
   "da": "Bekræftet polarlys på 48° magnetisk breddegrad eller lavere.",
   "sv": "Bekräftat polarsken på 48° magnetisk latitud eller lägre.",
   "fi": "Vahvistettu revontulihavainto 48° magneettisella leveysasteella tai etelämpänä.",
   "ru": "Подтверждённое полярное сияние на магнитной широте 48° или ниже."}');

-- Magnetic latitude from a centred dipole (pole at 80.8° N, 72.6° W), as in app/src/lib/astro.ts.
create or replace function public.mag_lat(p_lat double precision, p_lon double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select degrees(asin(greatest(-1, least(1,
    sin(radians(p_lat)) * sin(radians(80.8)) + cos(radians(p_lat)) * cos(radians(80.8)) * cos(radians(p_lon + 72.6))))));
$$;

-- ---------------------------------------------------------------------------------------------------
-- Members: their special badges, and redeeming a code
-- ---------------------------------------------------------------------------------------------------

create or replace function public.my_special_badges()
returns table (slug text, kind text, name jsonb, description jsonb, glyph text, at timestamptz, value real)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.kind, e.name, e.description, e.glyph, a.at, a.value
  from public.achievements a
  join public.special_events e on e.slug = a.ref
  where a.user_id = (select auth.uid()) and a.kind = 'special'
  order by a.at;
$$;
revoke execute on function public.my_special_badges() from public, anon;
grant execute on function public.my_special_badges() to authenticated;

-- Returns {"status": "ok", "slug": ...} or a status the app explains: invalid, expired, used, have, limit.
create or replace function public.redeem_badge_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  bc public.badge_codes;
  pts integer;
begin
  if uid is null then return jsonb_build_object('status', 'invalid'); end if;
  if (select count(*) from public.redeem_attempts r where r.user_id = uid and r.at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'limit');
  end if;
  insert into public.redeem_attempts (user_id) values (uid);

  select * into bc from public.badge_codes b where b.code = c;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if bc.expires_at is not null and bc.expires_at < now() then return jsonb_build_object('status', 'expired'); end if;
  if exists (select 1 from public.achievements a where a.user_id = uid and a.kind = 'special' and a.ref = bc.slug) then
    return jsonb_build_object('status', 'have', 'slug', bc.slug);
  end if;
  -- Counted in the same statement that checks the limit, so two guests can't take the last use.
  update public.badge_codes b set uses = b.uses + 1
    where b.code = c and (b.max_uses is null or b.uses < b.max_uses);
  if not found then return jsonb_build_object('status', 'used'); end if;

  select e.points into pts from public.special_events e where e.slug = bc.slug;
  perform public.award(uid, 'special', bc.slug, pts, null, now());
  perform public.refresh_points(uid);
  return jsonb_build_object('status', 'ok', 'slug', bc.slug);
end;
$$;
revoke execute on function public.redeem_badge_code(text) from public, anon;
grant execute on function public.redeem_badge_code(text) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Admin: make codes for a tour (run from the SQL editor; members can't call it)
-- ---------------------------------------------------------------------------------------------------

-- Makes p_count codes like 7KQM-X3PA (no 0, O, 1 or I) and returns them.
create or replace function public.create_badge_codes(p_slug text, p_count integer default 1, p_max_uses integer default 1, p_expires timestamptz default null, p_note text default null)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  c text;
  made integer := 0;
begin
  if not exists (select 1 from public.special_events e where e.slug = p_slug) then
    raise exception 'No special event %', p_slug;
  end if;
  while made < least(p_count, 1000) loop
    b := uuid_send(gen_random_uuid());
    c := '';
    for i in 0..7 loop c := c || substr(alphabet, get_byte(b, i) % 32 + 1, 1); end loop;
    insert into public.badge_codes (code, slug, max_uses, expires_at, note)
      values (c, p_slug, p_max_uses, p_expires, p_note) on conflict do nothing;
    if found then
      made := made + 1;
      return next substr(c, 1, 4) || '-' || substr(c, 5, 4);
    end if;
  end loop;
end;
$$;
revoke execute on function public.create_badge_codes(text, integer, integer, timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Awards: Low Latitude and named events, for confirmed sightings
-- ---------------------------------------------------------------------------------------------------

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
  ml double precision;
  ev record;
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

    -- Special badges (secret until earned): aurora far from the magnetic pole, and named storm events.
    ml := abs(public.mag_lat(s.lat, s.lon));
    if ml <= 55 then perform public.award(s.user_id, 'special', 'low-latitude', 50, ml::real, s.created_at); end if;
    if ml <= 48 then perform public.award(s.user_id, 'special', 'very-low-latitude', 100, ml::real, s.created_at); end if;
    for ev in
      select e.slug, e.points from public.special_events e
      where e.kind = 'event' and s.created_at between e.starts_at and e.ends_at
        and (e.lat is null or public.km_between(s.lat, s.lon, e.lat, e.lon) <= e.radius_km)
    loop
      perform public.award(s.user_id, 'special', ev.slug, ev.points, null, s.created_at);
    end loop;
  end loop;

  perform public.refresh_points(u) from unnest(touched) u group by u;
  return n;
end;
$$;
revoke execute on function public.award_sightings() from public, anon, authenticated;
