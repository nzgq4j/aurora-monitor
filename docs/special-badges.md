# Special badges

Special badges stay secret until a member earns one. On the Badges screen, members see only their own special badges, a mystery tile, and a count of how many they have found. Names, rules and the total are never sent to the app.

Each one is a row in `public.special_events`. Earning it adds an achievement of kind `special` (ref = the slug) worth the event's `points`. Run the snippets below in the Supabase SQL editor.

Each badge's name and description are stored per language. English (`en`) is required and is the fallback. The other codes are `es fr de nl nb da sv fi ru`.

Glyphs: `globe`, `ticket`, `flag`, `star` (the default), `bolt`, `eye`, `sunrise`, `camera`, `heart`, `pin`, `route`, `equinox`, `snow` and `moon`.

## Built in

| Slug | Earned by | Points |
| --- | --- | --- |
| `low-latitude` | A confirmed sighting at 55° magnetic latitude or lower | 50 |
| `very-low-latitude` | A confirmed sighting at 48° magnetic latitude or lower | 100 |

Magnetic latitude is calculated from a centred dipole, `public.mag_lat(lat, lon)`. For reference, London is about 53°, Minneapolis 53°, Edinburgh 58° and Fairbanks 66°.

A sighting counts as confirmed by the same rules as every other badge: another member reported aurora within 50 km and an hour, or the OVATION model showed 10% or more nearby. Awards run every 15 minutes, for reports more than an hour old.

## A named storm event

Every confirmed sighting between `starts_at` and `ends_at` earns the badge. You can limit it to a region by giving a centre point and a radius. If you leave `lat`, `lon` and `radius_km` out, the event counts worldwide.

```sql
insert into public.special_events (slug, kind, glyph, points, starts_at, ends_at, name, description)
values ('storm-2026-11', 'event', 'bolt', 75,
        '2026-11-12 18:00Z', '2026-11-13 12:00Z',
        '{"en": "November Storm 2026", "sv": "Novemberstormen 2026"}',
        '{"en": "Saw the great storm of 12–13 November 2026."}');

-- Scandinavia only: add the centre and radius (all three or none)
--   ..., lat, lon, radius_km) values (..., 63.0, 15.0, 900);
```

An event added after the storm still counts any sighting that has not yet been processed. Sightings are processed about an hour after they are made. To award sightings that were already processed, run this once:

```sql
select public.award(s.user_id, 'special', 'storm-2026-11', 75, null, s.created_at)
from public.sightings s
join public.achievements a on a.user_id = s.user_id and a.kind = 'report' and a.ref = s.id::text
where s.created_at between '2026-11-12 18:00Z' and '2026-11-13 12:00Z';
select public.refresh_points(user_id) from public.achievements where kind = 'special' and ref = 'storm-2026-11' group by user_id;
```

## A tour, with codes

```sql
insert into public.special_events (slug, kind, glyph, points, name, description)
values ('tromso-tours-2026', 'tour', 'ticket', 50,
        '{"en": "Tromsø Aurora Tour", "nb": "Nordlystur i Tromsø"}',
        '{"en": "Chased the lights on a guided tour from Tromsø."}');

-- 40 single-use codes that expire at the end of March; returns them as XXXX-XXXX
select * from public.create_badge_codes('tromso-tours-2026', 40, 1, '2027-03-31 23:59Z', 'Winter 2026 groups');

-- or one shared code for a whole group (up to 25 uses)
select * from public.create_badge_codes('tromso-tours-2026', 1, 25, null, 'Group 14 Nov');
```

Guests redeem their code from **Badges → Have a badge code? Redeem it**. Codes ignore case, spaces and the dash. Each member has 10 tries an hour, which limits guessing. Codes use letters and digits without 0, O, 1 or I.

Useful checks:

```sql
select code, uses, max_uses, expires_at, note from public.badge_codes where slug = 'tromso-tours-2026' order by created_at;
select count(*) from public.achievements where kind = 'special' and ref = 'tromso-tours-2026';
```

To retire a code, set its `expires_at` to `now()`. Members can only call `redeem_badge_code` and `my_special_badges`. `create_badge_codes` runs only from the SQL editor.
