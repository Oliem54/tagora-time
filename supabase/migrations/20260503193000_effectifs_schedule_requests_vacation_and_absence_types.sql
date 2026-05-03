-- Forward extension: effectifs schedule requests with vacation ranges and richer types.

alter table public.effectifs_employee_schedule_requests
  add column if not exists requested_start_date date null;

alter table public.effectifs_employee_schedule_requests
  add column if not exists requested_end_date date null;

alter table public.effectifs_employee_schedule_requests
  add column if not exists is_full_day boolean not null default false;

update public.effectifs_employee_schedule_requests
set requested_start_date = coalesce(requested_start_date, requested_date),
    requested_end_date = coalesce(requested_end_date, requested_date)
where requested_start_date is null
   or requested_end_date is null;

alter table public.effectifs_employee_schedule_requests
  drop constraint if exists effectifs_schedule_requests_type_check;

alter table public.effectifs_employee_schedule_requests
  add constraint effectifs_schedule_requests_type_check check (
    request_type in (
      'day_off',
      'vacation',
      'partial_absence',
      'late_arrival',
      'start_later',
      'leave_early',
      'change_shift',
      'swap_shift',
      'unavailable',
      'available_extra',
      'remote_work',
      'other'
    )
  );

alter table public.effectifs_employee_schedule_requests
  drop constraint if exists effectifs_schedule_requests_times_check;

alter table public.effectifs_employee_schedule_requests
  add constraint effectifs_schedule_requests_times_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  );

alter table public.effectifs_employee_schedule_requests
  drop constraint if exists effectifs_schedule_requests_period_check;

alter table public.effectifs_employee_schedule_requests
  add constraint effectifs_schedule_requests_period_check check (
    (
      requested_date is not null
      and requested_start_date is null
      and requested_end_date is null
    )
    or (
      requested_date is null
      and requested_start_date is not null
      and requested_end_date is not null
      and requested_end_date >= requested_start_date
    )
    or (
      requested_date is not null
      and requested_start_date is not null
      and requested_end_date is not null
      and requested_end_date >= requested_start_date
    )
  );

create index if not exists idx_effectifs_schedule_requests_start_end
  on public.effectifs_employee_schedule_requests (requested_start_date, requested_end_date);
