-- Web push subscriptions: one row per browser or installed app that allowed notifications.
-- The alert engine (service role) reads them to deliver push alerts and removes ones that have expired.
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "Users read their own push subscriptions" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add their own push subscriptions" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own push subscriptions" on public.push_subscriptions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users remove their own push subscriptions" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);
