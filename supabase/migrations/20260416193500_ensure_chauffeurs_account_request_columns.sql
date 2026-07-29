alter table if exists public.chauffeurs
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists primary_company text,
  add column if not exists can_work_for_oliem_solutions boolean not null default true,
  add column if not exists can_work_for_titan_produits_industriels boolean not null default false,
  add column if not exists social_benefits_percent numeric(5, 2) not null default 15,
  add column if not exists titan_billable boolean not null default false,
  add column if not exists schedule_start time,
  add column if not exists schedule_end time,
  add column if not exists planned_daily_hours numeric(5, 2),
  add column if not exists planned_weekly_hours numeric(5, 2),
  add column if not exists scheduled_work_days text[] not null default '{}',
  add column if not exists pause_minutes integer not null default 15,
  add column if not exists expected_breaks_count integer not null default 0,
  add column if not exists break_1_label text,
  add column if not exists break_1_minutes integer,
  add column if not exists break_1_paid boolean not null default true,
  add column if not exists break_2_label text,
  add column if not exists break_2_minutes integer,
  add column if not exists break_2_paid boolean not null default true,
  add column if not exists break_3_label text,
  add column if not exists break_3_minutes integer,
  add column if not exists break_3_paid boolean not null default true,
  add column if not exists break_am_enabled boolean not null default false,
  add column if not exists break_am_time time,
  add column if not exists break_am_minutes integer,
  add column if not exists break_am_paid boolean not null default true,
  add column if not exists lunch_enabled boolean not null default false,
  add column if not exists lunch_time time,
  add column if not exists lunch_minutes integer,
  add column if not exists lunch_paid boolean not null default false,
  add column if not exists break_pm_enabled boolean not null default false,
  add column if not exists break_pm_time time,
  add column if not exists break_pm_minutes integer,
  add column if not exists break_pm_paid boolean not null default true,
  add column if not exists sms_alert_depart_terrain boolean not null default true,
  add column if not exists sms_alert_arrivee_terrain boolean not null default true,
  add column if not exists sms_alert_sortie boolean not null default true,
  add column if not exists sms_alert_retour boolean not null default true,
  add column if not exists sms_alert_pause_debut boolean not null default true,
  add column if not exists sms_alert_pause_fin boolean not null default true,
  add column if not exists sms_alert_dinner_debut boolean not null default true,
  add column if not exists sms_alert_dinner_fin boolean not null default true,
  add column if not exists sms_alert_quart_debut boolean not null default true,
  add column if not exists sms_alert_quart_fin boolean not null default true;

update public.chauffeurs
set primary_company = coalesce(primary_company, 'oliem_solutions')
where primary_company is null;

alter table if exists public.chauffeurs
  drop constraint if exists chauffeurs_primary_company_check;

alter table if exists public.chauffeurs
  add constraint chauffeurs_primary_company_check
  check (
    primary_company in ('oliem_solutions', 'titan_produits_industriels')
  );

create unique index if not exists idx_chauffeurs_auth_user_id
  on public.chauffeurs (auth_user_id)
  where auth_user_id is not null;

create index if not exists idx_chauffeurs_primary_company
  on public.chauffeurs (primary_company);
