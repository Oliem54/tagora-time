alter table if exists public.horodateur_exceptions
  add column if not exists direction_reminder_email_notified_at timestamptz null,
  add column if not exists direction_reminder_sms_notified_at timestamptz null;

create index if not exists idx_horodateur_exceptions_direction_reminder_email_notified
  on public.horodateur_exceptions (direction_reminder_email_notified_at desc);

create index if not exists idx_horodateur_exceptions_direction_reminder_sms_notified
  on public.horodateur_exceptions (direction_reminder_sms_notified_at desc);

create table if not exists public.horodateur_direction_alert_config (
  config_key text primary key default 'default',
  email_enabled boolean not null default true,
  sms_enabled boolean not null default true,
  reminder_delay_minutes integer not null default 60,
  direction_emails text[] not null default '{}'::text[],
  direction_sms_numbers text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint horodateur_direction_alert_config_singleton_check check (config_key = 'default'),
  constraint horodateur_direction_alert_config_reminder_delay_check check (reminder_delay_minutes >= 5)
);

insert into public.horodateur_direction_alert_config (
  config_key,
  email_enabled,
  sms_enabled,
  reminder_delay_minutes
)
values (
  'default',
  true,
  true,
  60
)
on conflict (config_key) do nothing;
