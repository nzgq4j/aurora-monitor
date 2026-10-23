-- Alert settings were never saved from the app (the save in store.tsx was built but never sent), so no
-- account had a row and the alert run had nobody to alert. Give each account without one the defaults the
-- Alerts screen shows (lib/alerts DEFAULT_RULES, storm Kp 6, email and push on). The app saves the
-- account's own choices over these the next time it is opened; the time zone is filled in then too.
insert into public.alert_settings (user_id, kp_threshold, rules, time_zone, triggers, channels, updated_at)
select u.id, 6,
  '{"aurora":true,"level":"visible","forecast":true,"storm":true,"quiet":false,"quietFrom":"23:00","quietTo":"07:00"}'::jsonb,
  null,
  '{"kp":true,"cme":true,"clear":true,"bz":false,"sub":false}'::jsonb,
  '{"email":true,"push":true,"sms":false}'::jsonb,
  now()
from auth.users u
where not exists (select 1 from public.alert_settings s where s.user_id = u.id)
on conflict (user_id) do nothing;
