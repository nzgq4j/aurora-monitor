-- More Sun views for the live grid and the time-lapse: SDO AIA 211, 335, 1600 and 1700, SOHO LASCO C3,
-- NOAA's SUVI on GOES-19 (thematic map, 195 and 284 Å) and the CCOR-1 and CCOR-2 coronagraphs with their
-- running-difference views. Keep this list in step with SDO_IMAGES in app/src/lib/sdo.ts.
alter table public.sun_frames drop constraint sun_frames_channel_check;
alter table public.sun_frames add constraint sun_frames_channel_check
  check (channel in ('0193', '0171', '211193171', '0211', '0304', 'HMIIC', 'HMIBC', '0131', '0094', '0335', '1600', '1700',
                     'SUVIMAP', 'SUVI195', 'SUVI284', 'C2', 'C3', 'CCOR1', 'CCOR1D', 'CCOR2', 'CCOR2D'));

-- capture-sun now takes one group per call (sdo, suvi, ccor), so each stays inside the Edge CPU limit;
-- the three calls go out together every hour.
select cron.unschedule('capture-sun');
select cron.schedule(
  'capture-sun',
  '7 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/capture-sun',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_key')
    ),
    body    := jsonb_build_object('group', g),
    timeout_milliseconds := 120000
  )
  from unnest(array['sdo', 'suvi', 'ccor']) g;
  $$
);
