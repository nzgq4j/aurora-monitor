-- The lower flare option for Bluesky posts is now M2 and above (was M5 and above).
alter table public.social_settings drop constraint social_settings_flare_min_check;
update public.social_settings set flare_min = 'M2' where flare_min = 'M5';
alter table public.social_settings add constraint social_settings_flare_min_check check (flare_min in ('X', 'M2', 'off'));
