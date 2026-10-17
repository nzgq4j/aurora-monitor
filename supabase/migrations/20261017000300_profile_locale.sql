-- Each account's chosen interface language, so it follows the user across devices
-- (and can later drive localised emails). Null until set.
alter table public.profiles
  add column locale text check (locale in ('en', 'es', 'fr', 'de', 'nl'));

-- Users may change their own language, alongside their display name.
grant update (locale) on public.profiles to authenticated;

-- New accounts take the language they signed up in (sent as user metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    case when new.raw_user_meta_data ->> 'locale' in ('en', 'es', 'fr', 'de', 'nl') then new.raw_user_meta_data ->> 'locale' end
  );
  return new;
end;
$$;
