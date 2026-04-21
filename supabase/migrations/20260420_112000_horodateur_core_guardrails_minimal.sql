-- Minimal guardrails for core horodateur tables.
-- Non-destructive only: ensure canonical support columns/indexes exist.

alter table if exists public.horodateur_current_state
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists has_open_exception boolean not null default false;

alter table if exists public.horodateur_shifts
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists last_recomputed_at timestamptz not null default timezone('utc', now());

alter table if exists public.horodateur_exceptions
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists requested_at timestamptz not null default timezone('utc', now());

alter table if exists public.horodateur_direction_alert_config
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.horodateur_lateness_notifications
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if to_regclass('public.horodateur_current_state') is not null then
    execute 'create index if not exists idx_horodateur_current_state_updated on public.horodateur_current_state (updated_at desc)';
  end if;

  if to_regclass('public.horodateur_shifts') is not null then
    execute 'create index if not exists idx_horodateur_shifts_employee_work_date on public.horodateur_shifts (employee_id, work_date desc)';
  end if;

  if to_regclass('public.horodateur_exceptions') is not null then
    execute 'create index if not exists idx_horodateur_exceptions_status_requested on public.horodateur_exceptions (status, requested_at asc)';
  end if;

  if to_regclass('public.horodateur_lateness_notifications') is not null then
    execute 'create index if not exists idx_horodateur_lateness_notifications_employee_work_date on public.horodateur_lateness_notifications (employee_id, work_date desc)';
  end if;
end $$;
