-- Index mono-colonne status / start_date / end_date (liste spec).
create index if not exists idx_employee_leave_periods_status
  on public.employee_leave_periods (status);

create index if not exists idx_employee_leave_periods_start_date
  on public.employee_leave_periods (start_date);

create index if not exists idx_employee_leave_periods_end_date
  on public.employee_leave_periods (end_date);

notify pgrst, 'reload schema';
