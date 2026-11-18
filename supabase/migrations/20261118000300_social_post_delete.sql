-- Posts can be deleted from Bluesky from /social: 'deleting' (asked for; the cron retries) and 'deleted' (done).
alter table public.social_event_posts drop constraint social_event_posts_status_check;
alter table public.social_event_posts add constraint social_event_posts_status_check
  check (status in ('posting', 'posted', 'failed', 'deleting', 'deleted'));
create index social_event_posts_deleting on public.social_event_posts (status) where status = 'deleting';
