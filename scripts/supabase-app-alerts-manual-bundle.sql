-- Bundle manuel pour Supabase SQL Editor si `supabase db push` est bloqué.
-- Exécuter dans l'ordre : ce fichier concatène les migrations
-- 20260506140000_app_alerts_journal.sql puis 20260508100000_app_alerts_failed_status_dedupe_partial.sql

-- === 20260506140000_app_alerts_journal.sql ===

-- Journal central du Centre d'alertes (phase 2+).
-- Les envois Resend/Twilio existants restent inchangés ; les échecs pourront être
-- reflétés ici via app_alert_deliveries sans supprimer les logs actuels.

create table if not exists public.app_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  category text not null,
  priority text not null default 'medium',
  status text not null default 'open',
  title text not null,
  body text null,
  link_href text null,
  source_module text not null default 'unknown',
  ref_table text null,
  ref_id text null,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text null,
  employee_id bigint null references public.chauffeurs (id) on delete set null,
  company_key text null,
  handled_at timestamptz null,
  handled_by uuid null references auth.users (id) on delete set null,
  constraint app_alerts_priority_check check (
    priority in ('critical', 'high', 'medium', 'low')
  ),
  constraint app_alerts_status_check check (
    status in ('open', 'handled', 'archived', 'cancelled', 'snoozed')
  )
);

create unique index if not exists idx_app_alerts_dedupe_key_unique
  on public.app_alerts (dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_app_alerts_status_category_created
  on public.app_alerts (status, category, created_at desc);

create index if not exists idx_app_alerts_priority_open
  on public.app_alerts (priority, created_at desc)
  where status = 'open';

comment on table public.app_alerts is
  'Centre d alertes direction : file unifiée (phase 2). Catégories métier en texte libre contrôlé côté app.';

create table if not exists public.app_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid null references public.app_alerts (id) on delete cascade,
  channel text not null,
  provider text not null default 'unknown',
  status text not null default 'pending',
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_alert_deliveries_channel_check check (
    channel in ('email', 'sms', 'push', 'system')
  ),
  constraint app_alert_deliveries_status_check check (
    status in ('pending', 'sent', 'failed', 'skipped')
  )
);

create index if not exists idx_app_alert_deliveries_alert
  on public.app_alert_deliveries (alert_id, created_at desc);

create index if not exists idx_app_alert_deliveries_failed_created
  on public.app_alert_deliveries (created_at desc)
  where status = 'failed';

comment on table public.app_alert_deliveries is
  'Journal des tentatives d envoi (email/SMS) rattachées au centre d alertes.';

create or replace function public.set_app_alerts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_app_alerts_updated_at on public.app_alerts;
create trigger trg_app_alerts_updated_at
  before update on public.app_alerts
  for each row execute function public.set_app_alerts_updated_at();

drop trigger if exists trg_app_alert_deliveries_updated_at on public.app_alert_deliveries;
create trigger trg_app_alert_deliveries_updated_at
  before update on public.app_alert_deliveries
  for each row execute function public.set_app_alerts_updated_at();

alter table public.app_alerts enable row level security;
alter table public.app_alert_deliveries enable row level security;

-- === 20260508100000_app_alerts_failed_status_dedupe_partial.sql ===

drop index if exists public.idx_app_alerts_dedupe_key_unique;

create unique index if not exists idx_app_alerts_dedupe_key_open_unique
  on public.app_alerts (dedupe_key)
  where dedupe_key is not null and status in ('open', 'failed');

alter table public.app_alerts drop constraint if exists app_alerts_status_check;

alter table public.app_alerts
  add constraint app_alerts_status_check check (
    status in ('open', 'handled', 'archived', 'cancelled', 'snoozed', 'failed')
  );
