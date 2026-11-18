-- Viewing outlooks on Bluesky: posts about aurora viewing at chosen sites around the world.
-- Server-only like the rest of social posting: RLS on with no policies.

alter table public.social_settings add column viewing_enabled boolean not null default false;

alter table public.social_event_posts drop constraint social_event_posts_kind_check;
alter table public.social_event_posts add constraint social_event_posts_kind_check
  check (kind in ('storm', 'flare', 'shock', 'substorm', 'viewing'));

create table public.social_sites (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  lat         double precision not null check (lat between -90 and 90),
  lon         double precision not null check (lon between -180 and 180),
  -- Local hashtags added to posts for this site, e.g. '#nordlys #Norway'
  tags        text not null default '' check (char_length(tags) <= 80),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);
create index social_sites_created_by on public.social_sites (created_by);
alter table public.social_sites enable row level security;
revoke all on public.social_sites from anon, authenticated;

-- Seeded from the administrator's saved places (a copy: editing those places doesn't change this list).
insert into public.social_sites (name, lat, lon, tags) values
  ('Ørnes, Nordland',        66.86878,   13.70579, '#nordlys #Norway'),
  ('Fairbanks, Alaska',      64.83778, -147.71638, '#Alaska'),
  ('Yukagir, Sakha',         71.77646,  139.84840, '#Yakutia #Russia'),
  ('Churchill, Manitoba',    58.76811,  -94.16674, '#Manitoba #Canada'),
  ('Sandnessjøen, Nordland', 66.02166,   12.63158, '#nordlys #Norway'),
  ('Tjøtta, Nordland',       65.82258,   12.42837, '#nordlys #Norway'),
  ('Söderhamn, Gävleborg',   61.41500,   16.98600, '#norrsken #Sweden');
