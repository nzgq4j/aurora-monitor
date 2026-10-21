-- Three more SDO series for the Sun time-lapse: the AIA 211·193·171 composite (coronal holes), AIA 304
-- (prominences and filaments) and the colour HMI magnetogram (flare-prone regions).
alter table public.sun_frames drop constraint sun_frames_channel_check;
alter table public.sun_frames add constraint sun_frames_channel_check
  check (channel in ('0193', '0171', '211193171', '0304', 'HMIIC', 'HMIBC'));
