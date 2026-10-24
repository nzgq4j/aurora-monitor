-- Issue reports and feature requests sent from the dashboard (/api/feedback). Written only by the server
-- (service role): RLS is on with no policies, so members can't read or change any rows, their own included.
-- Rows go with the account (on delete cascade), like the rest of a member's data.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('issue', 'idea', 'other')),
  message text not null check (char_length(message) between 5 and 4000),
  -- Where it was sent from, to help reproduce an issue: app or website, language, plan, browser.
  context jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists feedback_user_created on public.feedback (user_id, created_at desc);
create index if not exists feedback_status_created on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
