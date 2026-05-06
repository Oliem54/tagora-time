create extension if not exists "pgcrypto";

alter table if exists public.chauffeurs
  add column if not exists primary_department text,
  add column if not exists secondary_departments text[] not null default '{}',
  add column if not exists can_deliver boolean not null default false,
  add column if not exists default_weekly_hours numeric,
  add column if not exists schedule_active boolean not null default true;

create table if not exists public.employee_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.chauffeurs(id) on delete cascade,
  department text not null,
  scheduled_date date not null,
  start_time time not null,
  end_time time not null,
  planned_hours numeric not null default 0,
  status text not null default 'planned',
  source text not null default 'manual',
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_schedules_status_check
    check (status in ('planned', 'confirmed', 'cancelled', 'absent', 'completed'))
);

create index if not exists idx_employee_schedules_date_department
  on public.employee_schedules (scheduled_date, department);

create index if not exists idx_employee_schedules_employee_date
  on public.employee_schedules (employee_id, scheduled_date);

create table if not exists public.department_coverage_requirements (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  day_of_week integer not null check (day_of_week between 1 and 7),
  start_time time not null default '08:00',
  end_time time not null default '17:00',
  min_employees integer not null default 0 check (min_employees >= 0),
  min_hours numeric not null default 0 check (min_hours >= 0),
  requirement_source text not null default 'manual'
    check (requirement_source in ('manual', 'delivery_based')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_department_coverage_requirements_department_day_source
  on public.department_coverage_requirements (department, day_of_week, requirement_source);

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
    ('Montage', 1, '08:00', '17:00', 2, 16, 'manual'),
    ('Montage', 2, '08:00', '17:00', 2, 16, 'manual'),
    ('Montage', 3, '08:00', '17:00', 2, 16, 'manual'),
    ('Montage', 4, '08:00', '17:00', 2, 16, 'manual'),
    ('Montage', 5, '08:00', '17:00', 2, 16, 'manual'),
    ('Showroom', 1, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom', 2, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom', 3, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom', 4, '09:00', '17:00', 1, 8, 'manual'),
    ('Showroom', 5, '09:00', '17:00', 1, 8, 'manual'),
    ('Opérations', 1, '08:00', '17:00', 1, 8, 'manual'),
    ('Opérations', 2, '08:00', '17:00', 1, 8, 'manual'),
    ('Opérations', 3, '08:00', '17:00', 1, 8, 'manual'),
    ('Opérations', 4, '08:00', '17:00', 1, 8, 'manual'),
    ('Opérations', 5, '08:00', '17:00', 1, 8, 'manual'),
    ('Livreur', 1, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 2, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 3, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 4, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 5, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 6, '08:00', '17:00', 0, 0, 'delivery_based'),
    ('Livreur', 7, '08:00', '17:00', 0, 0, 'delivery_based')
) as seed(department, day_of_week, start_time, end_time, min_employees, min_hours, requirement_source)
on conflict (department, day_of_week, requirement_source) do nothing;
