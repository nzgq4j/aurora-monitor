-- Push notifications from the Android app (Firebase Cloud Messaging) share the web push table: `kind`
-- tells them apart. App rows keep the FCM registration token in `endpoint` as 'fcm:<token>' (unique,
-- like a web push endpoint) and leave the web push keys empty.
alter table public.push_subscriptions
  add column kind text not null default 'web' check (kind in ('web', 'fcm'));
