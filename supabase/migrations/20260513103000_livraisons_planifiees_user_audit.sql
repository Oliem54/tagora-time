-- Ajoute les champs d'audit utilisateur (qui a programme / cree / modifie une livraison)
-- et de timestamps standard sur la table livraisons_planifiees.
--
-- Champs ajoutes :
--   created_by_user_id    : auth.users.id de l'utilisateur ayant cree la livraison
--   created_by_name       : snapshot du nom complet au moment de la creation
--   scheduled_by_user_id  : auth.users.id de l'utilisateur ayant programme la livraison
--                           (par defaut identique a created_by lors de la creation)
--   scheduled_by_name     : snapshot du nom complet au moment de la programmation
--   updated_by_user_id    : auth.users.id de l'utilisateur ayant fait la derniere modification
--   updated_by_name       : snapshot du nom complet au moment de la derniere modification
--   created_at            : date et heure UTC de creation (defaut now())
--   updated_at            : date et heure UTC de derniere modification (defaut now())
--
-- Note : les colonnes sont nullable pour rester compatibles avec les lignes existantes
-- creees avant l'introduction de l'audit. Les valeurs sont stampees cote API.

alter table public.livraisons_planifiees
  add column if not exists created_by_user_id uuid,
  add column if not exists created_by_name text,
  add column if not exists scheduled_by_user_id uuid,
  add column if not exists scheduled_by_name text,
  add column if not exists updated_by_user_id uuid,
  add column if not exists updated_by_name text,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'livraisons_planifiees'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'livraisons_planifiees_created_by_user_id_fkey'
      and con.conrelid = 'public.livraisons_planifiees'::regclass
  ) then
    alter table public.livraisons_planifiees
      add constraint livraisons_planifiees_created_by_user_id_fkey
      foreign key (created_by_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'livraisons_planifiees'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'livraisons_planifiees_scheduled_by_user_id_fkey'
      and con.conrelid = 'public.livraisons_planifiees'::regclass
  ) then
    alter table public.livraisons_planifiees
      add constraint livraisons_planifiees_scheduled_by_user_id_fkey
      foreign key (scheduled_by_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'livraisons_planifiees'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'livraisons_planifiees_updated_by_user_id_fkey'
      and con.conrelid = 'public.livraisons_planifiees'::regclass
  ) then
    alter table public.livraisons_planifiees
      add constraint livraisons_planifiees_updated_by_user_id_fkey
      foreign key (updated_by_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_livraisons_planifiees_created_by_user_id
  on public.livraisons_planifiees (created_by_user_id);

create index if not exists idx_livraisons_planifiees_updated_by_user_id
  on public.livraisons_planifiees (updated_by_user_id);

create index if not exists idx_livraisons_planifiees_created_at
  on public.livraisons_planifiees (created_at desc);

-- Backfill des created_at manquants pour les lignes anterieures a l'audit.
-- updated_at suit le defaut now() pour les nouvelles lignes ; on l'aligne sur created_at
-- pour les lignes existantes afin d'eviter des valeurs incoherentes.
update public.livraisons_planifiees
set created_at = coalesce(created_at, timezone('utc', now()))
where created_at is null;

update public.livraisons_planifiees
set updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where updated_at is null;
