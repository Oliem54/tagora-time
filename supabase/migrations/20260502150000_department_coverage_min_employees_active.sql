-- min_employees + active pour le module effectifs (config UI).

alter table public.department_coverage_windows
  add column if not exists active boolean not null default true;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'department_coverage_windows'
      and column_name = 'min_staff'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'department_coverage_windows'
      and column_name = 'min_employees'
  ) then
    alter table public.department_coverage_windows rename column min_staff to min_employees;
  end if;
end $$;

alter table public.department_coverage_windows
  add column if not exists min_employees smallint;

update public.department_coverage_windows
set min_employees = coalesce(min_employees, 1)
where min_employees is null;

alter table public.department_coverage_windows
  alter column min_employees set default 1;

alter table public.department_coverage_windows
  alter column min_employees set not null;

alter table public.department_coverage_windows
  drop constraint if exists department_coverage_windows_min_staff_check;

alter table public.department_coverage_windows
  drop constraint if exists department_coverage_windows_min_employees_check;

alter table public.department_coverage_windows
  add constraint department_coverage_windows_min_employees_check
  check (min_employees >= 0);

comment on column public.department_coverage_windows.min_employees is
  'Nombre minimal de personnes requises sur la plage (0 = aucune exigence).';

comment on column public.department_coverage_windows.active is
  'Si false, la plage est affichée mais exclue du calcul de couverture.';
