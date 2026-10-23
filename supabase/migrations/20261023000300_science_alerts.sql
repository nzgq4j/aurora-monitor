-- Scientific alerts (Chaser): solar flares, CMEs (forecast and shock arrival at L1) and strong solar-wind
-- coupling, logged like the others, and two more Sun series for the time-lapse (AIA 131 and 94 Å) plus the
-- SOHO LASCO C2 coronagraph.
set lock_timeout = '5s';
alter table public.alert_log drop constraint if exists alert_log_kind_check;
alter table public.alert_log add constraint alert_log_kind_check
  check (kind in ('aurora', 'forecast', 'storm', 'bz', 'substorm', 'coupling', 'flare', 'shock', 'cme'));

-- The old "CME arrival" switch defaulted to on but never did anything, so nobody chose it: start it off.
update public.alert_settings set triggers = triggers || '{"cme": false}'::jsonb where triggers->>'cme' = 'true';

alter table public.sun_frames drop constraint sun_frames_channel_check;
alter table public.sun_frames add constraint sun_frames_channel_check
  check (channel in ('0193', '0171', '211193171', '0304', 'HMIIC', 'HMIBC', '0131', '0094', 'C2'));
