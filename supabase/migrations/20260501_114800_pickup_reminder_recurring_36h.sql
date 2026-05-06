alter table public.direction_ramassage_alert_config
  add column if not exists pickup_reminder_alert_2_delay_hours integer not null default 36,
  add column if not exists pickup_reminder_recurring_delay_hours integer not null default 36,
  add column if not exists pickup_reminder_notify_client_sms boolean not null default true,
  add column if not exists pickup_reminder_notify_direction_admin_email boolean not null default true;

alter table public.direction_ramassage_alert_config
  alter column pickup_reminder_alert_1_delay_hours set default 24;

create table if not exists public.pickup_reminder_alerts (
  id uuid primary key default gen_random_uuid(),
  pickup_id bigint not null references public.livraisons_planifiees(id) on delete cascade
);

alter table public.pickup_reminder_alerts
  add column if not exists alert_sequence_number integer not null default 1,
  add column if not exists alert_type text not null default 'initial_1',
  add column if not exists scheduled_pickup_date date,
  add column if not exists sent_at timestamptz not null default timezone('utc', now()),
  add column if not exists to_email text,
  add column if not exists cc_emails text[] not null default '{}',
  add column if not exists to_phone text,
  add column if not exists email_status text,
  add column if not exists sms_status text,
  add column if not exists provider_email_message_id text,
  add column if not exists provider_sms_message_id text,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pickup_reminder_alerts_pickup_id_alert_level_key'
  ) then
    alter table public.pickup_reminder_alerts
      drop constraint pickup_reminder_alerts_pickup_id_alert_level_key;
  end if;
end
$$;

create unique index if not exists pickup_reminder_alerts_pickup_sequence_idx
  on public.pickup_reminder_alerts(pickup_id, alert_sequence_number);
