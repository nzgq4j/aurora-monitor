-- The gallery is moderated before publication, and gets a Recent tab.
--   * New posts are 'pending': only the poster sees them (My photos) until a moderator approves them.
--   * approve_photo() publishes one and gives the poster the photo points (no longer given at posting).
--   * gallery_page 'recent': the 20 most recently approved photos, newest approval first.
-- Photos already public count as approved when they were posted.
set lock_timeout = '5s';

alter table public.gallery_photos add column if not exists approved_at timestamptz;
update public.gallery_photos set approved_at = created_at where status = 'visible' and approved_at is null;
alter table public.gallery_photos drop constraint if exists gallery_photos_status_check;
alter table public.gallery_photos add constraint gallery_photos_status_check check (status in ('pending', 'visible', 'hidden', 'removed'));
create index if not exists gallery_photos_approved on public.gallery_photos (approved_at desc) where status = 'visible';

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

  -- Held for the moderator: nothing appears in the gallery until it is approved (approve_photo).
  insert into public.gallery_photos (user_id, taken_at, path, thumb_path, width, height, caption, place, lat, lon, kp, source, camera, status)
    values (uid, taken, p_path, p_thumb, p_width, p_height, nullif(trim(p_caption), ''), nullif(trim(p_place), ''), p_lat, p_lon,
            public.kp_at(taken), case when p_source = 'app' then 'app' else 'upload' end, nullif(trim(p_camera), ''), 'pending')
    returning gallery_photos.id into id;
  return id;
end;
$$;

-- A moderator publishes a pending photo (called by /api/gallery/moderate with the server's key).
create or replace function public.approve_photo(p_photo uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
begin
  update public.gallery_photos set status = 'visible', approved_at = now()
    where id = p_photo and status = 'pending'
    returning user_id, caption, place, camera into g;
  if not found then return false; end if;
  perform public.award(g.user_id, 'photo', p_photo::text, 10);
  -- Field notes: a caption, a place and the camera's settings.
  if g.caption is not null and g.place is not null and g.camera is not null then
    perform public.award(g.user_id, 'fieldnote', p_photo::text, 5);
  end if;
  perform public.refresh_points(g.user_id);
  return true;
end;
$$;
revoke execute on function public.approve_photo(uuid) from public, anon, authenticated;
grant execute on function public.approve_photo(uuid) to service_role;

create or replace function public.gallery_page(
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
  where (case p_filter
           when 'mine' then g.user_id = auth.uid() and g.status <> 'removed'
           -- A single photo: public ones, and the poster's own while it waits for review.
           when 'one' then g.status = 'visible' or (g.user_id = auth.uid() and g.status <> 'removed')
           else g.status = 'visible' end)
    and not exists (select 1 from public.member_blocks b where b.user_id = auth.uid() and b.blocked_id = g.user_id)
    and case p_filter
      when 'tonight' then g.taken_at > now() - interval '18 hours'
      when 'storm' then g.kp >= 4.66 and g.taken_at > now() - interval '7 days'
      when 'near' then g.lat is not null and p_lat is not null and g.taken_at > now() - interval '30 days'
        and public.km_between(p_lat, p_lon, g.lat, g.lon) <= 500
      when 'top' then g.taken_at > now() - interval '30 days'
      when 'recent' then g.approved_at is not null
      when 'around' then p_at is not null and g.taken_at between p_at - interval '12 hours' and p_at + interval '12 hours' and (p_id is null or g.id <> p_id)
      when 'one' then g.id = p_id
      else true
    end
  order by case when p_filter = 'top' then g.helpful else 0 end desc,
           case when p_filter = 'recent' then g.approved_at end desc nulls last,
           g.featured desc, g.taken_at desc, g.id desc
  offset least(greatest(coalesce(p_offset, 0), 0), 600)
  -- Recent stops at 20 photos in all, however it is paged.
  limit least(greatest(p_limit, 1), case when p_filter = 'recent' then greatest(20 - least(greatest(coalesce(p_offset, 0), 0), 600), 0) else 60 end);
$$;
revoke execute on function public.gallery_page(text, double precision, double precision, timestamptz, uuid, integer, integer) from public;
grant execute on function public.gallery_page(text, double precision, double precision, timestamptz, uuid, integer, integer) to anon, authenticated;
