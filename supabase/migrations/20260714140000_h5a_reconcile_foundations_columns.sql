-- ============================================================
-- H5-A forward-only reconciliation (foundations / columns)
-- Canonical historical sources (DO NOT re-run / DO NOT mark applied):
--   20260412170000_employee_breaks.sql                  (R1)
--   20260412181500_breakdown_work_time.sql              (R1)
--   20260419103000_horodateur_exception_direction_notifications.sql (R1)
--   20260419141500_horodateur_direction_alert_config_and_reminders.sql (R1)
--   20260419164500_horodateur_lateness_notifications.sql (R1)
--   20260420111000_chauffeurs_telephone_canonical_minimal.sql (R1)
--
-- Scope: add missing foundation columns / tables / indexes / views.
-- No DROP, no CASCADE, no TRUNCATE, no seed Oliem/Titan rows.
-- Out of scope: later H5 lots and H4 SaaS.
-- ============================================================

-- --- 20260412170000 employee breaks ---
alter table if exists public.chauffeurs
  add column if not exists expected_breaks_count integer not null default 0,
  add column if not exists break_1_label text,
  add column if not exists break_1_minutes integer,
  add column if not exists break_1_paid boolean not null default true,
  add column if not exists break_2_label text,
  add column if not exists break_2_minutes integer,
  add column if not exists break_2_paid boolean not null default true,
  add column if not exists break_3_label text,
  add column if not exists break_3_minutes integer,
  add column if not exists break_3_paid boolean not null default true;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chauffeurs'
      and column_name = 'pause_minutes'
  ) then
    execute $sql$
      update public.chauffeurs
      set
        expected_breaks_count = case
          when coalesce(pause_minutes, 0) > 0 then greatest(expected_breaks_count, 1)
          else expected_breaks_count
        end,
        break_1_label = coalesce(
          break_1_label,
          case when coalesce(pause_minutes, 0) > 0 then 'Pause 1' else null end
        ),
        break_1_minutes = coalesce(break_1_minutes, pause_minutes),
        break_1_paid = coalesce(break_1_paid, true)
      where coalesce(pause_minutes, 0) > 0
    $sql$;
  end if;
end $$;

-- --- 20260412181500 breakdown work time ---
alter table if exists public.sorties_terrain
  add column if not exists morning_break_minutes integer not null default 0,
  add column if not exists morning_break_paid boolean not null default true,
  add column if not exists lunch_minutes integer not null default 0,
  add column if not exists lunch_paid boolean not null default false,
  add column if not exists afternoon_break_minutes integer not null default 0,
  add column if not exists afternoon_break_paid boolean not null default true,
  add column if not exists presence_minutes integer not null default 0,
  add column if not exists paid_break_minutes integer not null default 0,
  add column if not exists unpaid_break_minutes integer not null default 0,
  add column if not exists payable_minutes integer not null default 0,
  add column if not exists facturable_minutes integer not null default 0,
  add column if not exists temps_payable text,
  add column if not exists temps_non_payable text,
  add column if not exists temps_facturable text;

alter table if exists public.temps_titan
  add column if not exists morning_break_minutes integer not null default 0,
  add column if not exists morning_break_paid boolean not null default true,
  add column if not exists lunch_minutes integer not null default 0,
  add column if not exists lunch_paid boolean not null default false,
  add column if not exists afternoon_break_minutes integer not null default 0,
  add column if not exists afternoon_break_paid boolean not null default true,
  add column if not exists presence_minutes integer not null default 0,
  add column if not exists paid_break_minutes integer not null default 0,
  add column if not exists unpaid_break_minutes integer not null default 0,
  add column if not exists payable_minutes integer not null default 0,
  add column if not exists facturable_minutes integer not null default 0,
  add column if not exists temps_presence text,
  add column if not exists temps_payable text,
  add column if not exists temps_non_payable text,
  add column if not exists temps_facturable text;

update public.temps_titan
set
  presence_minutes = case
    when coalesce(presence_minutes, 0) > 0 then presence_minutes
    else round(coalesce(duree_heures, 0) * 60)::integer
  end,
  payable_minutes = case
    when coalesce(payable_minutes, 0) > 0 then payable_minutes
    else round(coalesce(duree_heures, 0) * 60)::integer
  end,
  facturable_minutes = case
    when coalesce(facturable_minutes, 0) > 0 then facturable_minutes
    else round(coalesce(duree_heures, 0) * 60)::integer
  end,
  temps_presence = coalesce(temps_presence, duree_totale),
  temps_payable = coalesce(temps_payable, duree_totale),
  temps_non_payable = coalesce(temps_non_payable, '0 min'),
  temps_facturable = coalesce(temps_facturable, duree_totale)
where true;

-- Views depend on company_context / billing_company_context (H5-B groundwork).
-- Create only when those columns already exist (local after early migrations; staging after H5-B).
do $$
declare
  has_company boolean;
  has_billing boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'temps_titan' and column_name = 'company_context'
  ) into has_company;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'temps_titan' and column_name = 'billing_company_context'
  ) into has_billing;

  if has_company and has_billing then
    execute $sql$
      create or replace view public.intercompany_billing_summary as
      select
        tt.company_context,
        tt.billing_company_context,
        tt.employe_id,
        tt.employe_nom,
        sum(
          case
            when coalesce(tt.facturable_minutes, 0) > 0 then tt.facturable_minutes::numeric / 60.0
            else coalesce(tt.duree_heures, 0)
          end
        ) as total_hours,
        sum(coalesce(tt.distance_km, 0)) as total_km,
        sum(coalesce(tt.total_facturable, 0)) as total_billable
      from public.temps_titan tt
      where tt.billing_company_context is not null
        and tt.billing_company_context <> tt.company_context
      group by
        tt.company_context,
        tt.billing_company_context,
        tt.employe_id,
        tt.employe_nom
    $sql$;

    execute $sql$
      create or replace view public.payroll_company_summary as
      select
        coalesce(tt.company_context, 'oliem_solutions') as company_context,
        tt.employe_id,
        tt.employe_nom,
        min(tt.date_travail) as first_work_date,
        max(tt.date_travail) as last_work_date,
        sum(
          case
            when coalesce(tt.payable_minutes, 0) > 0 then tt.payable_minutes::numeric / 60.0
            else coalesce(tt.duree_heures, 0)
          end
        ) as total_hours,
        sum(coalesce(tt.total_salaire, 0)) as total_salary,
        sum(coalesce(tt.total_benefice, 0)) as total_margin,
        sum(coalesce(tt.total_titan, 0)) as total_billable
      from public.temps_titan tt
      group by coalesce(tt.company_context, 'oliem_solutions'), tt.employe_id, tt.employe_nom
    $sql$;
  end if;
end $$;

-- --- 20260419103000 + 20260419141500 horodateur exception notifications ---
alter table if exists public.horodateur_exceptions
  add column if not exists direction_email_notified_at timestamptz null,
  add column if not exists direction_sms_notified_at timestamptz null,
  add column if not exists direction_reminder_email_notified_at timestamptz null,
  add column if not exists direction_reminder_sms_notified_at timestamptz null;

create index if not exists idx_horodateur_exceptions_direction_email_notified
  on public.horodateur_exceptions (direction_email_notified_at desc);

create index if not exists idx_horodateur_exceptions_direction_sms_notified
  on public.horodateur_exceptions (direction_sms_notified_at desc);

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

-- --- 20260419164500 lateness notifications ---
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

-- --- 20260420111000 chauffeurs telephone canonical ---
alter table if exists public.chauffeurs
  add column if not exists telephone text,
  add column if not exists auth_user_id uuid,
  add column if not exists phone_number text;

do $$
declare
  has_phone_number boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chauffeurs'
      and column_name = 'phone_number'
  ) into has_phone_number;

  if has_phone_number then
    execute $sql$
      update public.chauffeurs
      set telephone = phone_number
      where (telephone is null or btrim(telephone) = '')
        and phone_number is not null
        and btrim(phone_number) <> ''
    $sql$;

    execute $sql$
      update public.chauffeurs
      set phone_number = telephone
      where (phone_number is null or btrim(phone_number) = '')
        and telephone is not null
        and btrim(telephone) <> ''
    $sql$;
  end if;
end $$;

create index if not exists idx_chauffeurs_auth_user_id
  on public.chauffeurs (auth_user_id)
  where auth_user_id is not null;

create index if not exists idx_chauffeurs_telephone
  on public.chauffeurs (telephone)
  where telephone is not null;
