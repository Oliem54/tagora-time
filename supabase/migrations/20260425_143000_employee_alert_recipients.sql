alter table if exists public.chauffeurs
  add column if not exists alert_email_enabled boolean not null default true,
  add column if not exists alert_sms_enabled boolean not null default true,
  add column if not exists is_direction_alert_recipient boolean not null default false;

create index if not exists idx_chauffeurs_direction_alert_recipient
  on public.chauffeurs (is_direction_alert_recipient)
  where is_direction_alert_recipient = true;
