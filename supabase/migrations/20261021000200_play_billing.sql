-- Google Play subscriptions (the Android app). The profile's subscription columns now mirror either
-- Stripe or Google Play; billing_source says which. Written only by the server (service role): the
-- Stripe webhook, and /api/play/verify and /api/play/rtdn for Play.
alter table public.profiles
  add column billing_source      text check (billing_source in ('stripe', 'play')),
  add column play_purchase_token text unique,
  add column play_product_id     text;

update public.profiles set billing_source = 'stripe' where stripe_subscription_id is not null and billing_source is null;

comment on column public.profiles.billing_source is 'Which service bills the subscription in subscription_status: stripe (website) or play (Android app).';

-- Any paid subscription (Stripe or Google Play) is cancelled where it was bought, never by flipping
-- the plan here, or the customer would keep being charged.
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
  if me.subscription_status in ('trialing', 'active', 'past_due') and (me.stripe_subscription_id is not null or me.play_purchase_token is not null) then
    raise exception 'Manage this subscription where it was bought';
  end if;
  update public.profiles set plan = 'free', updated_at = now()
   where id = (select auth.uid())
  returning * into me;
  return me;
end;
$$;
