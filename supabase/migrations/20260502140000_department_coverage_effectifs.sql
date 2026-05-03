-- Fenêtres d'ouverture / heures à couvrir par département (vue effectifs direction).
-- 0 = lundi … 6 = dimanche (aligné sur weekly-schedule côté app).

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
  add column if not exists min_employees integer not null default 1;

alter table public.department_coverage_windows
  add column if not exists active boolean not null default true;

alter table public.department_coverage_windows
  add column if not exists created_at timestamptz not null default now();

alter table public.department_coverage_windows
  add column if not exists updated_at timestamptz not null default now();

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

comment on column public.chauffeurs.effectifs_department_key is
  'Affectation plancher / effectifs (vue couverture direction).';

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

drop index if exists public.idx_department_coverage_windows_dept_weekday;

create index if not exists idx_department_coverage_windows_dept_dow
  on public.department_coverage_windows (department_key, day_of_week);

comment on table public.department_coverage_windows is
  'Heures à couvrir au plancher par département (module /direction/effectifs).';
