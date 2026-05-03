-- Colonnes canoniques day_of_week + location, department_key nullable, contraintes départements étendues.
-- Compatible avec les migrations 20260502140000 / 20260502150000 (weekday, location_key, location_label).

-- ---------------------------------------------------------------------------
-- chauffeurs : liste de départements effectifs (alignement snippet projet)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- department_coverage_windows : day_of_week, location, sync legacy
-- ---------------------------------------------------------------------------
-- Schéma historique (app) : weekday, location_key, location_label
alter table public.department_coverage_windows
  add column if not exists weekday smallint;

alter table public.department_coverage_windows
  add column if not exists location_key text;

alter table public.department_coverage_windows
  add column if not exists location_label text;

alter table public.department_coverage_windows
  add column if not exists day_of_week integer;

alter table public.department_coverage_windows
  add column if not exists location text;

-- Backfill day_of_week depuis weekday (schéma historique)
update public.department_coverage_windows d
set day_of_week = d.weekday::integer
where d.day_of_week is null
  and exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'department_coverage_windows'
      and c.column_name = 'weekday'
  )
  and d.weekday is not null;

-- Backfill weekday depuis day_of_week (schéma minimal type snippet utilisateur)
update public.department_coverage_windows d
set weekday = d.day_of_week::smallint
where d.weekday is null
  and d.day_of_week is not null
  and exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'department_coverage_windows'
      and c.column_name = 'weekday'
  );

-- Valeur par défaut si les deux manquent (évite lignes bloquantes)
update public.department_coverage_windows
set day_of_week = 0
where day_of_week is null;

update public.department_coverage_windows d
set weekday = d.day_of_week::smallint
where d.weekday is null
  and d.day_of_week is not null
  and exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'department_coverage_windows'
      and c.column_name = 'weekday'
  );

-- location depuis location_key
update public.department_coverage_windows d
set location = coalesce(nullif(trim(d.location_key::text), ''), 'principal')
where (d.location is null or trim(d.location) = '')
  and exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'department_coverage_windows'
      and c.column_name = 'location_key'
  );

-- location_key depuis location (inverse)
update public.department_coverage_windows d
set location_key = coalesce(nullif(trim(d.location), ''), 'principal')
where (d.location_key is null or trim(d.location_key::text) = '')
  and d.location is not null
  and trim(d.location) <> ''
  and exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'department_coverage_windows'
      and c.column_name = 'location_key'
  );

-- department_key nullable (l’API actuelle exige encore un département à la création)
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

alter table public.department_coverage_windows
  drop constraint if exists department_coverage_windows_day_of_week_check;

-- Après backfill, day_of_week doit être renseigné
update public.department_coverage_windows
set day_of_week = 0
where day_of_week is null;

alter table public.department_coverage_windows
  alter column day_of_week set not null;

alter table public.department_coverage_windows
  add constraint department_coverage_windows_day_of_week_check
  check (day_of_week >= 0 and day_of_week <= 6);

update public.department_coverage_windows
set location = 'principal'
where location is null or trim(location) = '';

alter table public.department_coverage_windows
  alter column location set default 'principal';

alter table public.department_coverage_windows
  alter column location set not null;

create index if not exists idx_department_coverage_windows_dept_dow
  on public.department_coverage_windows (department_key, day_of_week);

comment on column public.department_coverage_windows.day_of_week is
  '0 = lundi … 6 = dimanche (alias canonique de weekday pour outils / exports).';
comment on column public.department_coverage_windows.location is
  'Emplacement / clé lieu (alias de location_key côté schéma simplifié).';
