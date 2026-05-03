-- Assouplir les CHECK fixes sur department_key pour permettre les clés
-- définies dans public.effectifs_departments (y compris les slugs personnalisés).
-- La validation métier reste côté application (répertoire effectifs).

alter table public.chauffeurs
  drop constraint if exists chauffeurs_effectifs_department_key_check;

alter table public.department_coverage_windows
  drop constraint if exists department_coverage_windows_department_key_check;

alter table public.effectifs_calendar_exceptions
  drop constraint if exists effectifs_calendar_exceptions_department_key_check;

alter table public.effectifs_employee_schedule_requests
  drop constraint if exists effectifs_schedule_requests_dept_check;

alter table public.effectifs_regular_closed_days
  drop constraint if exists effectifs_regular_closed_days_department_check;
