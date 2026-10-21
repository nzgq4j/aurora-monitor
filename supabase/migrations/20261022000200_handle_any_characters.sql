-- Gallery names may use any characters (upper and lower case, accents, spaces, punctuation): 3 to 24
-- characters, no control characters, no leading, trailing or repeated spaces. They stay unique whatever
-- their case, so "DDaniel" and "ddaniel" can't both exist.

alter table public.members drop constraint members_handle_check;
alter table public.members add constraint members_handle_check
  check (char_length(handle) between 3 and 24 and handle = btrim(handle) and handle !~ '[[:cntrl:]]' and handle !~ '\s{2,}');
create unique index members_handle_lower on public.members (lower(handle));

-- Change the gallery name. Returns 'ok', 'invalid' or 'taken'.
create or replace function public.set_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return 'invalid'; end if;
  p_handle := regexp_replace(btrim(p_handle), '\s+', ' ', 'g');
  if char_length(p_handle) not between 3 and 24 or p_handle ~ '[[:cntrl:]]' then return 'invalid'; end if;
  perform public.ensure_member(auth.uid());
  if exists (select 1 from public.members m where lower(m.handle) = lower(p_handle) and m.user_id <> auth.uid()) then return 'taken'; end if;
  begin
    update public.members set handle = p_handle where user_id = auth.uid();
  exception when unique_violation then
    return 'taken';
  end;
  return 'ok';
end;
$$;
