-- The free trial is 7 days everywhere (Stripe, Google Play and this function).
-- start_trial() is kept for the service role only (see 20261022000300_fix_first.sql); same body, 7 days.
create or replace function public.start_trial(tier text, cycle text default 'annual')
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  if (select auth.uid()) is null then raise exception 'Not signed in'; end if;
  if tier not in ('chaser') then raise exception 'Unknown tier %', tier; end if;
  if cycle not in ('monthly', 'annual') then raise exception 'Unknown billing cycle %', cycle; end if;
  select * into me from public.profiles where id = (select auth.uid()) for update;
  if me.trial_ends_at is not null and me.trial_ends_at < now() then
    raise exception 'Your free trial has already been used';
  end if;
  update public.profiles
     set plan = tier, billing_cycle = cycle,
         trial_ends_at = coalesce(trial_ends_at, now() + interval '7 days'),
         updated_at = now()
   where id = (select auth.uid())
  returning * into me;
  return me;
end;
$$;

revoke execute on function public.start_trial(text, text) from public, anon, authenticated;
