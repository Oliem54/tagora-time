create table if not exists public.horodateur_lateness_notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.chauffeurs (id) on delete cascade,
  work_date date not null,
  scheduled_start_at timestamptz not null,
  detected_at timestamptz not null default timezone('utc', now()),
  late_detected_at timestamptz not null default timezone('utc', now()),
  late_direction_email_notified_at timestamptz null,
  late_direction_sms_notified_at timestamptz null,
  late_employee_sms_notified_at timestamptz null,
  resolution_reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint horodateur_lateness_notifications_employee_work_date_key
    unique (employee_id, work_date)
);

create index if not exists idx_horodateur_lateness_notifications_work_date
  on public.horodateur_lateness_notifications (work_date desc);

create index if not exists idx_horodateur_lateness_notifications_detected
  on public.horodateur_lateness_notifications (late_detected_at desc);
