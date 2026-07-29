alter table if exists public.horodateur_exceptions
  add column if not exists direction_email_notified_at timestamptz null,
  add column if not exists direction_sms_notified_at timestamptz null;

create index if not exists idx_horodateur_exceptions_direction_email_notified
  on public.horodateur_exceptions (direction_email_notified_at desc);

create index if not exists idx_horodateur_exceptions_direction_sms_notified
  on public.horodateur_exceptions (direction_sms_notified_at desc);
