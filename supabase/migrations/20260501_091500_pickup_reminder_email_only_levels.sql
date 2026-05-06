alter table public.direction_ramassage_alert_config
  add column if not exists pickup_reminder_enabled boolean not null default true,
  add column if not exists pickup_reminder_alert_1_delay_hours integer not null default 48,
  add column if not exists pickup_reminder_alert_2_delay_days integer not null default 7,
  add column if not exists pickup_reminder_alert_3_delay_days integer not null default 14,
  add column if not exists pickup_reminder_notify_direction_email boolean not null default true,
  add column if not exists pickup_reminder_notify_selected_employees_email boolean not null default true,
  add column if not exists pickup_reminder_notify_client_email boolean not null default true;

alter table public.chauffeurs
  add column if not exists receive_pickup_reminder_email_alerts boolean not null default false;

create table if not exists public.pickup_reminder_alerts (
  id uuid primary key default gen_random_uuid(),
  pickup_id bigint not null references public.livraisons_planifiees(id) on delete cascade,
  alert_level smallint not null check (alert_level in (1, 2, 3)),
  expected_pickup_date date,
  delay_hours integer not null default 0,
  status_snapshot text,
  internal_email_sent boolean not null default false,
  client_email_sent boolean not null default false,
  direction_notified boolean not null default false,
  selected_employees_notified boolean not null default false,
  recipients jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (pickup_id, alert_level)
);

alter table public.pickup_reminder_alerts enable row level security;

drop policy if exists "pickup_reminder_alerts_select_direction_admin" on public.pickup_reminder_alerts;
create policy "pickup_reminder_alerts_select_direction_admin"
  on public.pickup_reminder_alerts
  for select
  to authenticated
  using (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) in ('direction', 'admin', 'manager')
  );

drop policy if exists "pickup_reminder_alerts_write_admin_only" on public.pickup_reminder_alerts;
create policy "pickup_reminder_alerts_write_admin_only"
  on public.pickup_reminder_alerts
  for all
  to authenticated
  using (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) = 'admin'
  )
  with check (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) = 'admin'
  );
