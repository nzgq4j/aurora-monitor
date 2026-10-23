-- Technical alerts (Chaser): Bz turns south and substorm onset, logged like the others. `value` holds
-- the reading behind the alert: Bz in nT, or the hemispheric power reached, in GW.
set lock_timeout = '5s';
alter table public.alert_log drop constraint if exists alert_log_kind_check;
alter table public.alert_log add constraint alert_log_kind_check check (kind in ('aurora', 'forecast', 'storm', 'bz', 'substorm'));
alter table public.alert_log add column if not exists value real;
