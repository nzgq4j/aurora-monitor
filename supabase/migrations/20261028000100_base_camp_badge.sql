-- Base Camp: a special badge for the first 500 Chaser members, redeemed with a shared code (500 uses).
-- Two new options on special events:
--   requires_plan  only members on this plan (as effective_plan() sees it, so trials count) may redeem its codes
--   finish         the badge's look in the app: 'special' (rose gold) or 'borealis' (aurora green, red and purple)
alter table public.special_events
  add column requires_plan text check (requires_plan in ('chaser')),
  add column finish text not null default 'special' check (finish in ('special', 'borealis'));

insert into public.special_events (slug, kind, glyph, points, finish, requires_plan, name, description) values
('base-camp', 'tour', 'camp', 100, 'borealis', 'chaser',
 '{"en": "Base Camp", "es": "Campamento base", "fr": "Camp de base", "de": "Basislager", "nl": "Basiskamp",
   "nb": "Baseleir", "da": "Baselejr", "sv": "Basläger", "fi": "Perusleiri", "ru": "Базовый лагерь"}',
 '{"en": "One of the first 500 Chaser members of Polar Lights.",
   "es": "Uno de los primeros 500 miembros Chaser de Polar Lights.",
   "fr": "L’un des 500 premiers membres Chaser de Polar Lights.",
   "de": "Eines der ersten 500 Chaser-Mitglieder von Polar Lights.",
   "nl": "Een van de eerste 500 Chaser-leden van Polar Lights.",
   "nb": "Ett av de første 500 Chaser-medlemmene i Polar Lights.",
   "da": "Et af de første 500 Chaser-medlemmer af Polar Lights.",
   "sv": "En av de första 500 Chaser-medlemmarna i Polar Lights.",
   "fi": "Yksi Polar Lightsin 500 ensimmäisestä Chaser-jäsenestä.",
   "ru": "Один из первых 500 участников Chaser в Polar Lights."}');

-- The badge's finish now goes to the app with the rest.
drop function public.my_special_badges();
create function public.my_special_badges()
returns table (slug text, kind text, name jsonb, description jsonb, glyph text, finish text, at timestamptz, value real)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.kind, e.name, e.description, e.glyph, e.finish, a.at, a.value
  from public.achievements a
  join public.special_events e on e.slug = a.ref
  where a.user_id = (select auth.uid()) and a.kind = 'special'
  order by a.at;
$$;
revoke execute on function public.my_special_badges() from public, anon;
grant execute on function public.my_special_badges() to authenticated;

-- Adds the plan check (status 'plan'), made before a use of the code is counted.
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
  ev public.special_events;
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
  select * into ev from public.special_events e where e.slug = bc.slug;
  if ev.requires_plan is not null
     and coalesce((select public.effective_plan(p) from public.profiles p where p.id = uid), 'free') <> ev.requires_plan then
    return jsonb_build_object('status', 'plan');
  end if;
  -- Counted in the same statement that checks the limit, so two members can't take the last use.
  update public.badge_codes b set uses = b.uses + 1
    where b.code = c and (b.max_uses is null or b.uses < b.max_uses);
  if not found then return jsonb_build_object('status', 'used'); end if;

  pts := ev.points;
  perform public.award(uid, 'special', bc.slug, pts, null, now());
  perform public.refresh_points(uid);
  return jsonb_build_object('status', 'ok', 'slug', bc.slug);
end;
$$;
revoke execute on function public.redeem_badge_code(text) from public, anon;
grant execute on function public.redeem_badge_code(text) to authenticated;
