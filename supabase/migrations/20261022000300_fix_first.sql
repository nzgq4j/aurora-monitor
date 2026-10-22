-- Fixes from the October 2026 code quality and security review ("Fix first").
--
-- 1. Alert settings are written by each user's own browser, so their shape is checked here: one bad row
--    (a number for a quiet-hours time, a huge object) can no longer reach the alert engine.
-- 2. start_trial() gave any signed-in account 14 days of Chaser with no card. Trials now start only through
--    Stripe Checkout or Google Play; the function stays for the service role.
-- 3. Push subscriptions must point at a real push service (or be an app token), and each user may register
--    at most 10 devices: the alert server never posts to an address a user typed in.
-- 4. Signed-out visitors can no longer run the member-only gallery functions.
-- 5. sightings_nearby() can only look back 24 hours over at most 300 km, matching what the map shows.
-- 6. The gallery pages by position in its full sort order (gallery_page, by offset) instead of by time, so
--    "Show more" neither skips nor repeats photos on Top or when a photo is featured.

-- 1. Alert settings shape.
alter table public.alert_settings
  add constraint alert_settings_rules_shape check (
    rules is null or (
      jsonb_typeof(rules) = 'object' and pg_column_size(rules) < 2048
      and (rules->'quietFrom' is null or (jsonb_typeof(rules->'quietFrom') = 'string' and rules->>'quietFrom' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
      and (rules->'quietTo' is null or (jsonb_typeof(rules->'quietTo') = 'string' and rules->>'quietTo' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
      and (rules->'level' is null or rules->>'level' in ('faint', 'visible', 'clear'))
      and (rules->'aurora' is null or jsonb_typeof(rules->'aurora') = 'boolean')
      and (rules->'forecast' is null or jsonb_typeof(rules->'forecast') = 'boolean')
      and (rules->'storm' is null or jsonb_typeof(rules->'storm') = 'boolean')
      and (rules->'quiet' is null or jsonb_typeof(rules->'quiet') = 'boolean'))),
  add constraint alert_settings_channels_shape check (channels is null or (jsonb_typeof(channels) = 'object' and pg_column_size(channels) < 512)),
  add constraint alert_settings_triggers_shape check (triggers is null or (jsonb_typeof(triggers) = 'object' and pg_column_size(triggers) < 512)),
  add constraint alert_settings_time_zone_length check (time_zone is null or char_length(time_zone) <= 64);

-- 2. No self-service trials.
revoke execute on function public.start_trial(text, text) from public, anon, authenticated;

-- 3. Push subscriptions: known push services only, at most 10 per user.
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_service check (
    (kind = 'fcm' and endpoint ~ '^fcm:[A-Za-z0-9_:-]+$' and char_length(endpoint) between 24 and 4100)
    or (kind is distinct from 'fcm' and endpoint ~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)/')),
  add constraint push_subscriptions_user_agent_length check (user_agent is null or char_length(user_agent) <= 300);

create or replace function public.push_subscriptions_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.push_subscriptions p where p.user_id = new.user_id and p.endpoint <> new.endpoint) >= 10 then
    raise exception 'At most 10 devices' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger push_subscriptions_limit before insert on public.push_subscriptions
  for each row execute function public.push_subscriptions_limit();
revoke execute on function public.push_subscriptions_limit() from public, anon, authenticated;

-- 4. Member-only gallery functions are for signed-in members.
revoke execute on function public.my_member(), public.set_handle(text), public.my_blocks(), public.block_photo_owner(uuid),
  public.report_photo(uuid, text),
  public.post_photo(text, text, integer, integer, text, text, double precision, double precision, text, timestamptz, text, text)
  from anon;
-- The pg_net functions and queue tables are granted by Supabase's own admin role, which this project's
-- owner can't revoke; the net schema isn't exposed through the API, so they aren't reachable from the site.

-- 5. Nearby sightings: the last 24 hours at most, within 300 km.
create or replace function public.sightings_nearby(p_lat double precision, p_lon double precision, radius_km double precision default 100, hours double precision default 1)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.sightings s
  where s.created_at > now() - make_interval(secs => least(greatest(coalesce(hours, 1), 0), 24) * 3600)
    and (auth.uid() is null or s.user_id <> auth.uid())
    and public.km_between(p_lat, p_lon, s.lat, s.lon) <= least(greatest(coalesce(radius_km, 100), 0), 300);
$$;

-- 6. Gallery paging by offset in the full sort order (helpful for Top, featured, newest, id). A new function,
--    so pages loaded before this release keep using gallery_feed() until they reload.
create function public.gallery_page(
  p_filter text default 'tonight', p_lat double precision default null, p_lon double precision default null,
  p_at timestamptz default null, p_id uuid default null, p_offset integer default 0, p_limit integer default 30)
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
  order by case when p_filter = 'top' then g.helpful else 0 end desc, g.featured desc, g.taken_at desc, g.id desc
  offset least(greatest(coalesce(p_offset, 0), 0), 600)
  limit least(greatest(p_limit, 1), 60);
$$;
revoke execute on function public.gallery_page(text, double precision, double precision, timestamptz, uuid, integer, integer) from public;
grant execute on function public.gallery_page(text, double precision, double precision, timestamptz, uuid, integer, integer) to anon, authenticated;
