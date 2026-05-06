create extension if not exists "pgcrypto";

alter table if exists public.chauffeurs
  add column if not exists primary_location text,
  add column if not exists secondary_locations text[] not null default '{}',
  add column if not exists usual_schedule jsonb;

alter table if exists public.employee_schedules
  add column if not exists location text;

create table if not exists public.employee_usual_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.chauffeurs(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  department text null,
  location text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_usual_schedules_employee_day
  on public.employee_usual_schedules (employee_id, day_of_week);

update public.department_coverage_requirements
set active = false
where department in ('Montage', 'Showroom');

insert into public.department_coverage_requirements (
  department,
  day_of_week,
  start_time,
  end_time,
  min_employees,
  min_hours,
  requirement_source,
  active
)
select seed.department,
       seed.day_of_week,
       seed.start_time::time,
       seed.end_time::time,
       seed.min_employees,
       seed.min_hours,
       seed.requirement_source,
       true
from (
  values
    ('Montage voiturette', 1, '08:00', '17:00', 2, 16, 'manual'),
    ('Montage voiturette', 2, '08:00', '17:00', 2, 16, 'manual'),
    ('Montage voiturette', 3, '08:00', '17:00', 2, 16, 'manual'),
    ('Montage voiturette', 4, '08:00', '17:00', 2, 16, 'manual'),
    ('Montage voiturette', 5, '08:00', '17:00', 2, 16, 'manual'),
    ('Showroom Oliem', 1, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom Oliem', 2, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom Oliem', 3, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom Oliem', 4, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom Oliem', 5, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom Titan', 1, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom Titan', 2, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom Titan', 3, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom Titan', 4, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom Titan', 5, '09:00', '17:00', 1, 8, 'manual'),
    ('Opérations', 1, '08:00', '17:00', 1, 8, 'manual'),
    ('Opérations', 2, '08:00', '17:00', 1, 8, 'manual'),
    ('Opérations', 3, '08:00', '17:00', 1, 8, 'manual'),
    ('Opérations', 4, '08:00', '17:00', 1, 8, 'manual'),
    ('Opérations', 5, '08:00', '17:00', 1, 8, 'manual'),
    ('Design numérique', 1, '08:00', '17:00', 1, 8, 'manual'),
    ('Design numérique', 2, '08:00', '17:00', 1, 8, 'manual'),
    ('Design numérique', 3, '08:00', '17:00', 1, 8, 'manual'),
    ('Design numérique', 4, '08:00', '17:00', 1, 8, 'manual'),
    ('Design numérique', 5, '08:00', '17:00', 1, 8, 'manual'),
    ('Administration', 1, '08:00', '17:00', 1, 8, 'manual'),
    ('Administration', 2, '08:00', '17:00', 1, 8, 'manual'),
    ('Administration', 3, '08:00', '17:00', 1, 8, 'manual'),
    ('Administration', 4, '08:00', '17:00', 1, 8, 'manual'),
    ('Administration', 5, '08:00', '17:00', 1, 8, 'manual'),
    ('Livreur', 1, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 2, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 3, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 4, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 5, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 6, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 7, '08:00', '17:00', 0, 0, 'delivery_based')
) as seed(department, day_of_week, start_time, end_time, min_employees, min_hours, requirement_source)
on conflict (department, day_of_week, requirement_source) do update
set start_time = excluded.start_time,
    end_time = excluded.end_time,
    min_employees = excluded.min_employees,
    min_hours = excluded.min_hours,
    active = true;
