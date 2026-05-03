-- Correction forward : converge department_coverage_windows (et contrainte chauffeurs)
-- lorsqu'une ancienne version de 20260502140000 a déjà été appliquée.
-- Ne supprime pas les colonnes legacy (weekday, location_key, etc.). Pas de RLS / hors scope.

-- ---------------------------------------------------------------------------
-- 1. Table canonique si absente (alignée dépôt 20260502140000)
-- ---------------------------------------------------------------------------
create table if not exists public.department_coverage_windows (
  id uuid primary key default gen_random_uuid(),
  department_key text,
  location text,
  day_of_week integer not null,
  start_local time not null,
  end_local time not null,
  min_employees integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Colonnes manquantes
-- ---------------------------------------------------------------------------
alter table public.department_coverage_windows
  add column if not exists department_key text;

alter table public.department_coverage_windows
  add column if not exists location text;

alter table public.department_coverage_windows
  add column if not exists day_of_week integer;

alter table public.department_coverage_windows
  add column if not exists start_local time;

alter table public.department_coverage_windows
  add column if not exists end_local time;

alter table public.department_coverage_windows
  add column if not exists min_employees integer;

alter table public.department_coverage_windows
  add column if not exists active boolean;

alter table public.department_coverage_windows
  add column if not exists created_at timestamptz;

alter table public.department_coverage_windows
  add column if not exists updated_at timestamptz;

-- min_staff (historique) → min_employees si les deux colonnes existent
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'department_coverage_windows'
      and column_name = 'min_staff'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'department_coverage_windows'
      and column_name = 'min_employees'
  ) then
    update public.department_coverage_windows
    set min_employees = min_staff::integer
    where min_employees is null
      and min_staff is not null;
  end if;
end $$;

-- Defaults / NOT NULL pour colonnes ajoutées sur table existante
update public.department_coverage_windows
set min_employees = coalesce(min_employees, 1)
where min_employees is null;

alter table public.department_coverage_windows
  alter column min_employees set default 1;

alter table public.department_coverage_windows
  alter column min_employees set not null;

update public.department_coverage_windows
set active = coalesce(active, true)
where active is null;

alter table public.department_coverage_windows
  alter column active set default true;

alter table public.department_coverage_windows
  alter column active set not null;

update public.department_coverage_windows
set created_at = coalesce(created_at, now())
where created_at is null;

alter table public.department_coverage_windows
  alter column created_at set default now();

alter table public.department_coverage_windows
  alter column created_at set not null;

update public.department_coverage_windows
set updated_at = coalesce(updated_at, now())
where updated_at is null;

alter table public.department_coverage_windows
  alter column updated_at set default now();

alter table public.department_coverage_windows
  alter column updated_at set not null;

-- ---------------------------------------------------------------------------
-- 3. department → department_key (si colonne department existe)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'department_coverage_windows'
      and column_name = 'department'
  ) then
    update public.department_coverage_windows
    set department_key = department
    where department_key is null
      and department is not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. weekday → day_of_week (si colonne weekday existe)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'department_coverage_windows'
      and column_name = 'weekday'
  ) then
    update public.department_coverage_windows
    set day_of_week = weekday::integer
    where day_of_week is null
      and weekday is not null;
  end if;
end $$;

-- Valeur sûre si toujours null (évite NOT NULL impossible)
update public.department_coverage_windows
set day_of_week = 0
where day_of_week is null;

alter table public.department_coverage_windows
  alter column day_of_week set not null;

-- start_local / end_local : schémas historiques les ont en général déjà
update public.department_coverage_windows
set start_local = time '00:00'
where start_local is null;

update public.department_coverage_windows
set end_local = time '23:59'
where end_local is null;

alter table public.department_coverage_windows
  alter column start_local set not null;

alter table public.department_coverage_windows
  alter column end_local set not null;

-- department_key nullable (schéma attendu)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'department_coverage_windows'
      and column_name = 'department_key'
      and is_nullable = 'NO'
  ) then
    alter table public.department_coverage_windows
      alter column department_key drop not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. CHECK chauffeurs + department_coverage_windows (liste étendue)
-- ---------------------------------------------------------------------------
alter table public.chauffeurs
  add column if not exists effectifs_department_key text null;

alter table public.chauffeurs
  drop constraint if exists chauffeurs_effectifs_department_key_check;

alter table public.chauffeurs
  add constraint chauffeurs_effectifs_department_key_check
  check (
    effectifs_department_key is null
    or effectifs_department_key in (
      'showroom_oliem',
      'showroom_titan',
      'montage_voiturette',
      'service_apres_vente',
      'design_numerique',
      'operations',
      'livreur',
      'administration',
      'autre'
    )
  );

alter table public.department_coverage_windows
  drop constraint if exists department_coverage_windows_department_key_check;

alter table public.department_coverage_windows
  add constraint department_coverage_windows_department_key_check
  check (
    department_key is null
    or department_key in (
      'showroom_oliem',
      'showroom_titan',
      'montage_voiturette',
      'service_apres_vente',
      'design_numerique',
      'operations',
      'livreur',
      'administration',
      'autre'
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Index department_key, day_of_week
-- ---------------------------------------------------------------------------
drop index if exists public.idx_department_coverage_windows_dept_dow;

create index idx_department_coverage_windows_dept_dow
  on public.department_coverage_windows (department_key, day_of_week);

comment on table public.department_coverage_windows is
  'Heures à couvrir au plancher par département (module /direction/effectifs).';
