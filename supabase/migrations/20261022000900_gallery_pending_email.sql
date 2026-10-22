-- Email the moderators when a photo is posted for review (/api/gallery/pending sends it).
--   * A trigger asks the site as soon as a pending photo is saved. pg_net sends the request after the
--     posting transaction commits, so posting never waits for it.
--   * Every 15 minutes the same route is called as a safety net, for any photo whose email failed.
--   * notified_at records which photos the moderators have been told about, so each is emailed once.
set lock_timeout = '5s';

alter table public.gallery_photos add column if not exists notified_at timestamptz;
-- Photos already waiting count as notified: they are on the moderation screen already.
update public.gallery_photos set notified_at = now() where status = 'pending' and notified_at is null;

create or replace function public.gallery_photos_pending_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url     := 'https://www.polarlights.io/api/gallery/pending',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alerts-key', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  return null;
end;
$$;
revoke execute on function public.gallery_photos_pending_notify() from public, anon, authenticated;

create trigger gallery_photos_pending_notify after insert on public.gallery_photos
  for each row when (new.status = 'pending') execute function public.gallery_photos_pending_notify();

select cron.schedule(
  'gallery-pending-email',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://www.polarlights.io/api/gallery/pending',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alerts-key', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from public.gallery_photos where status = 'pending' and notified_at is null);
  $$
);
