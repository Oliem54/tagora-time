create extension if not exists "pgcrypto";

create table if not exists public.department_coverage_windows (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  location text null,
  day_of_week integer not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  min_employees integer not null default 1 check (min_employees >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_department_coverage_windows_department_day
  on public.department_coverage_windows (department, day_of_week);

create index if not exists idx_department_coverage_windows_active
  on public.department_coverage_windows (active);

create unique index if not exists uq_department_coverage_windows_unique_window
  on public.department_coverage_windows (department, coalesce(location, ''), day_of_week, start_time, end_time);

insert into public.department_coverage_windows (
  department,
  location,
  day_of_week,
  start_time,
  end_time,
  min_employees,
  active
)
select seed.department,
       seed.location,
       seed.day_of_week,
       seed.start_time::time,
       seed.end_time::time,
       seed.min_employees,
       seed.active
from (
  values
    ('Montage voiturette', 'Entrepôt', 1, '08:00', '17:00', 2, true),
    ('Montage voiturette', 'Entrepôt', 2, '08:00', '17:00', 2, true),
    ('Montage voiturette', 'Entrepôt', 3, '08:00', '17:00', 2, true),
    ('Montage voiturette', 'Entrepôt', 4, '08:00', '17:00', 2, true),
    ('Montage voiturette', 'Entrepôt', 5, '08:00', '17:00', 2, true),
    ('Showroom Oliem', 'Oliem', 1, '09:00', '17:00', 1, true),
    ('Showroom Oliem', 'Oliem', 2, '09:00', '20:00', 1, true),
    ('Showroom Oliem', 'Oliem', 3, '09:00', '17:00', 1, true),
    ('Showroom Oliem', 'Oliem', 4, '09:00', '20:00', 1, true),
    ('Showroom Oliem', 'Oliem', 5, '09:00', '17:00', 1, true),
    ('Showroom Oliem', 'Oliem', 6, '10:00', '16:00', 1, true),
    ('Showroom Titan', 'Titan', 1, '09:00', '17:00', 1, true),
    ('Showroom Titan', 'Titan', 2, '09:00', '18:00', 1, true),
    ('Showroom Titan', 'Titan', 3, '09:00', '17:00', 1, true),
    ('Showroom Titan', 'Titan', 4, '09:00', '18:00', 1, true),
    ('Showroom Titan', 'Titan', 5, '09:00', '17:00', 1, true),
    ('Opérations', 'Oliem', 1, '08:00', '17:00', 1, true),
    ('Opérations', 'Oliem', 2, '08:00', '17:00', 1, true),
    ('Opérations', 'Oliem', 3, '08:00', '17:00', 1, true),
    ('Opérations', 'Oliem', 4, '08:00', '17:00', 1, true),
    ('Opérations', 'Oliem', 5, '08:00', '17:00', 1, true),
    ('Service après vente', 'Oliem', 1, '08:00', '17:00', 1, true),
    ('Service après vente', 'Oliem', 2, '08:00', '17:00', 1, true),
    ('Service après vente', 'Oliem', 3, '08:00', '17:00', 1, true),
    ('Service après vente', 'Oliem', 4, '08:00', '17:00', 1, true),
    ('Service après vente', 'Oliem', 5, '08:00', '17:00', 1, true),
    ('Design numérique', 'Télétravail', 1, '08:00', '17:00', 1, true),
    ('Design numérique', 'Télétravail', 2, '08:00', '17:00', 1, true),
    ('Design numérique', 'Télétravail', 3, '08:00', '17:00', 1, true),
    ('Design numérique', 'Télétravail', 4, '08:00', '17:00', 1, true),
    ('Design numérique', 'Télétravail', 5, '08:00', '17:00', 1, true),
    ('Administration', 'Oliem', 1, '08:00', '17:00', 1, true),
    ('Administration', 'Oliem', 2, '08:00', '17:00', 1, true),
    ('Administration', 'Oliem', 3, '08:00', '17:00', 1, true),
    ('Administration', 'Oliem', 4, '08:00', '17:00', 1, true),
    ('Administration', 'Oliem', 5, '08:00', '17:00', 1, true),
    ('Livreur', 'Route', 1, '08:00', '17:00', 1, true),
    ('Livreur', 'Route', 2, '08:00', '17:00', 1, true),
    ('Livreur', 'Route', 3, '08:00', '17:00', 1, true),
    ('Livreur', 'Route', 4, '08:00', '17:00', 1, true),
    ('Livreur', 'Route', 5, '08:00', '17:00', 1, true),
    ('Livreur', 'Route', 6, '08:00', '17:00', 1, true),
    ('Livreur', 'Route', 7, '08:00', '17:00', 1, true)
) as seed(department, location, day_of_week, start_time, end_time, min_employees, active)
on conflict do nothing;
