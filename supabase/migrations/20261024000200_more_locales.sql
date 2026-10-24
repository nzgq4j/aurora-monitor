-- Five more interface languages: Norwegian (Bokmål), Danish, Swedish, Finnish and Russian.
-- Keep this list in step with LOCALES in app/src/i18n/config.ts.
alter table public.profiles drop constraint profiles_locale_check;
alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('en', 'es', 'fr', 'de', 'nl', 'nb', 'da', 'sv', 'fi', 'ru'));

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
    case when new.raw_user_meta_data ->> 'locale' in ('en', 'es', 'fr', 'de', 'nl', 'nb', 'da', 'sv', 'fi', 'ru') then new.raw_user_meta_data ->> 'locale' end
  );
  return new;
end;
$$;
