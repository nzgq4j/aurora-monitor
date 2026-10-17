-- Stripe subscriptions. Columns are written only by the Stripe webhook (service role);
-- users can still update just display_name and locale.
alter table public.profiles
  add column stripe_customer_id     text unique,
  add column stripe_subscription_id text unique,
  -- Stripe's subscription status: trialing, active, past_due, canceled, unpaid, incomplete, ...
  add column subscription_status    text,
  -- End of the period already paid for (or of the trial); renews or ends then.
  add column current_period_end     timestamptz,
  add column cancel_at_period_end   boolean not null default false;

comment on column public.profiles.plan is 'Tier on the account. Paid tiers apply while a Stripe subscription is trialing, active or past due, or (for complimentary and pre-Stripe accounts) while trial_ends_at is in the future.';
comment on column public.profiles.trial_ends_at is 'End of the one free trial (no-card trial before Stripe, or the Stripe trial). Non-null means the trial has been used.';

-- The plan in force for a profile. Shared by the location limit and anything else server-side.
create or replace function public.effective_plan(p public.profiles)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p.plan is null or p.plan = 'free' then 'free'
    when p.subscription_status in ('trialing', 'active', 'past_due') then p.plan
    when p.trial_ends_at is not null and p.trial_ends_at > now() then p.plan
    else 'free'
  end;
$$;

create or replace function public.enforce_location_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  tier text;
  max_locations int;
  current_count int;
begin
  select * into p from public.profiles where id = new.user_id;
  tier := public.effective_plan(p);
  max_locations := case tier when 'chaser' then 10 else 1 end;
  select count(*) into current_count from public.locations where user_id = new.user_id;
  if current_count >= max_locations then
    raise exception 'Location limit reached for the % plan (%).', tier, max_locations using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- A Stripe subscription is cancelled in Stripe (billing portal), never by flipping the plan here,
-- or the customer would keep being charged.
create or replace function public.cancel_membership()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  if (select auth.uid()) is null then raise exception 'Not signed in'; end if;
  select * into me from public.profiles where id = (select auth.uid()) for update;
  if me.stripe_subscription_id is not null and me.subscription_status in ('trialing', 'active', 'past_due') then
    raise exception 'Manage this subscription in the billing portal';
  end if;
  update public.profiles set plan = 'free', updated_at = now()
   where id = (select auth.uid())
  returning * into me;
  return me;
end;
$$;

revoke execute on function public.effective_plan(public.profiles) from public, anon;
grant execute on function public.effective_plan(public.profiles) to authenticated;
