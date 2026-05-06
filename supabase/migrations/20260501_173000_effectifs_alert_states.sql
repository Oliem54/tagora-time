create extension if not exists "pgcrypto";

create table if not exists public.effectifs_alert_states (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique,
  status text not null default 'active'
    check (status in ('active', 'resolue', 'ignoree', 'echue', 'archivee')),
  department text null,
  location text null,
  alert_date date null,
  severity text null,
  message text null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz null,
  ignored_at timestamptz null,
  expired_at timestamptz null,
  archived_at timestamptz null,
  resolved_by uuid null,
  ignored_by uuid null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_effectifs_alert_states_status
  on public.effectifs_alert_states (status);

create index if not exists idx_effectifs_alert_states_alert_date
  on public.effectifs_alert_states (alert_date);

create index if not exists idx_effectifs_alert_states_last_seen
  on public.effectifs_alert_states (last_seen_at desc);
