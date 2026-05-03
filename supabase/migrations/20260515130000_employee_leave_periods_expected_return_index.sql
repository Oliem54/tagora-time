-- Index manquant pour filtrage par date de retour prévue (alignement scripts / specs).
create index if not exists idx_employee_leave_periods_expected_return_date
  on public.employee_leave_periods (expected_return_date);

notify pgrst, 'reload schema';
