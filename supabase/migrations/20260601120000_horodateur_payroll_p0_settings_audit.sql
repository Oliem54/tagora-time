-- P0 Horodateur / Paie : paramètres financiers par employé + journal d audit.
-- Idempotent. Aucun backfill de montants.

create table if not exists public.employee_payroll_settings (
  employee_id bigint primary key references public.chauffeurs (id) on delete cascade,
  payroll_hourly_rate numeric(10, 2) null,
  vacation_rate_percent numeric(5, 2) not null default 4,
  vacation_rate_is_custom boolean not null default false,
  vacation_opening_balance_amount numeric(12, 2) not null default 0,
  vacation_opening_balance_date date null,
  vacation_adjustment_note text null,
  holiday_opening_balance_amount numeric(12, 2) not null default 0,
  opening_balance_note text null,
  updated_by_user_id uuid null references auth.users (id) on delete set null,
  updated_by_name text null,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.employee_payroll_settings
  drop constraint if exists employee_payroll_settings_vacation_rate_check;

alter table if exists public.employee_payroll_settings
  add constraint employee_payroll_settings_vacation_rate_check
  check (vacation_rate_percent >= 0 and vacation_rate_percent <= 100);

comment on table public.employee_payroll_settings is
  'Paramètres financiers paie/vacances/fériés par employé. Écriture admin via API uniquement.';

comment on column public.employee_payroll_settings.payroll_hourly_rate is
  'Taux horaire pour conversion minutes admissibles en salaire ($).';

comment on column public.employee_payroll_settings.vacation_rate_percent is
  'Taux vacances : 4, 6, 8 ou autre si vacation_rate_is_custom.';

create table if not exists public.horodateur_payroll_audit_logs (
  id bigserial primary key,
  employee_id bigint not null references public.chauffeurs (id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  permission_scope text not null default 'operational',
  actor_role text not null default 'system',
  old_value jsonb null,
  new_value jsonb null,
  reason text null,
  created_by_user_id uuid null references auth.users (id) on delete set null,
  created_by_name text null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.horodateur_payroll_audit_logs
  drop constraint if exists horodateur_payroll_audit_logs_permission_scope_check;

alter table if exists public.horodateur_payroll_audit_logs
  add constraint horodateur_payroll_audit_logs_permission_scope_check
  check (permission_scope in ('operational', 'financial'));

alter table if exists public.horodateur_payroll_audit_logs
  drop constraint if exists horodateur_payroll_audit_logs_actor_role_check;

alter table if exists public.horodateur_payroll_audit_logs
  add constraint horodateur_payroll_audit_logs_actor_role_check
  check (actor_role in ('direction', 'admin', 'employe', 'system'));

create index if not exists idx_horodateur_payroll_audit_employee_created
  on public.horodateur_payroll_audit_logs (employee_id, created_at desc);

create index if not exists idx_horodateur_payroll_audit_entity
  on public.horodateur_payroll_audit_logs (entity_type, entity_id);

comment on column public.horodateur_payroll_audit_logs.permission_scope is
  'operational | financial';

comment on column public.horodateur_payroll_audit_logs.actor_role is
  'direction | admin | employe | system';

alter table if exists public.employee_payroll_settings enable row level security;
alter table if exists public.horodateur_payroll_audit_logs enable row level security;

notify pgrst, 'reload schema';
