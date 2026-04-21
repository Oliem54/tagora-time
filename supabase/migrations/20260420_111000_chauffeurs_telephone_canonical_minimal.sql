-- Canonical minimal migration for chauffeurs.
-- Goals:
-- 1) Guarantee canonical telephone exists.
-- 2) Keep phone_number for transition.
-- 3) Backfill both directions where missing to keep compatibility.

alter table if exists public.chauffeurs
  add column if not exists telephone text,
  add column if not exists auth_user_id uuid;

do $$
declare
  has_phone_number boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chauffeurs'
      and column_name = 'phone_number'
  ) into has_phone_number;

  if has_phone_number then
    execute $sql$
      update public.chauffeurs
      set telephone = phone_number
      where (telephone is null or btrim(telephone) = '')
        and phone_number is not null
        and btrim(phone_number) <> ''
    $sql$;

    execute $sql$
      update public.chauffeurs
      set phone_number = telephone
      where (phone_number is null or btrim(phone_number) = '')
        and telephone is not null
        and btrim(telephone) <> ''
    $sql$;
  end if;
end $$;

create index if not exists idx_chauffeurs_auth_user_id
  on public.chauffeurs (auth_user_id)
  where auth_user_id is not null;

create index if not exists idx_chauffeurs_telephone
  on public.chauffeurs (telephone)
  where telephone is not null;
