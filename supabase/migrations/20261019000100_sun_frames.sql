-- Sun time-lapse: copies of the three SDO images on the Now page (AIA 193, AIA 171, HMI), saved
-- hourly by the capture-sun edge function so the app can play the Sun's rotation. Files live in the
-- public `sun-frames` bucket (anyone can view them, as the originals); this table lists them. 28 days
-- are kept (one solar rotation is about 27 days); the function removes older frames.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sun-frames', 'sun-frames', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create table public.sun_frames (
  channel   text not null check (channel in ('0193', '0171', 'HMIIC')),
  -- When SDO made the image (its Last-Modified time), so each image is kept once.
  taken_at  timestamptz not null,
  path      text not null,
  primary key (channel, taken_at)
);

alter table public.sun_frames enable row level security;
create policy "Sun frames are public" on public.sun_frames for select to anon, authenticated using (true);
revoke all on public.sun_frames from anon, authenticated;
grant select on public.sun_frames to anon, authenticated;

-- Hourly, a few minutes after the hour (same call pattern as ingest-space-weather).
select cron.schedule(
  'capture-sun',
  '7 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/capture-sun',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
