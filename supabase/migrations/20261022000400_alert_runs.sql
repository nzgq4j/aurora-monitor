-- One row per alert run (/api/alerts/run, every 10 minutes): what it did, whether the forecast feeds were
-- available, how many users it couldn't reach, and the error when it failed. Written and pruned (14 days)
-- by the run itself with the service key; nobody else can read it.
create table public.alert_runs (
  id       bigint generated always as identity primary key,
  ran_at   timestamptz not null default now(),
  ok       boolean not null,
  ms       integer,
  summary  jsonb,
  error    text check (char_length(error) <= 500)
);
create index alert_runs_ran_at on public.alert_runs (ran_at desc);
alter table public.alert_runs enable row level security;
revoke all on public.alert_runs from anon, authenticated;
