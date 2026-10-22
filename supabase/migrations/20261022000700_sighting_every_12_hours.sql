-- One sighting report per member every 12 hours (was 30 minutes). The rest of the trigger is unchanged:
-- the time is the server's, and the position is rounded to about 10 km.
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
  if exists (select 1 from public.sightings s where s.user_id = new.user_id and s.created_at > now() - interval '12 hours') then
    raise exception 'One sighting per 12 hours' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.sightings_before_insert() from public, anon, authenticated;
