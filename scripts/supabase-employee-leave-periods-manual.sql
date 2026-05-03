-- Réparation manuelle : public.employee_leave_periods (erreur PostgREST « schema cache »).
-- Idempotent : safe à relancer.
-- DDL aligné sur supabase/migrations/20260510120000_employee_leave_periods.sql
-- Les INSERT app_communication_templates du fichier migration ne sont pas repris ici
-- (exécutez la migration complète si vous devez aussi créer les gabarits).

-- Table
create table if not exists public.employee_leave_periods (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.chauffeurs (id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date null,
  expected_return_date date null,
  is_indefinite boolean not null default false,
  status text not null default 'active',
  reason_public text null,
  private_note text null,
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz null,
  ended_by uuid null references auth.users (id) on delete set null,
  constraint employee_leave_periods_leave_type_chk check (
    leave_type in (
      'sick_leave',
      'injury',
      'personal_leave',
      'vacation_extended',
      'administrative_leave',
      'other'
    )
  ),
  constraint employee_leave_periods_status_chk check (status in ('active', 'ended', 'cancelled'))
);

-- Index (dont expected_return_date)
create unique index if not exists idx_employee_leave_periods_one_active
  on public.employee_leave_periods (employee_id)
  where status = 'active';

create index if not exists idx_employee_leave_periods_employee
  on public.employee_leave_periods (employee_id);

create index if not exists idx_employee_leave_periods_status_dates
  on public.employee_leave_periods (status, start_date, end_date);

-- Index mono-colonne (spec / requêtes ciblées)
create index if not exists idx_employee_leave_periods_status
  on public.employee_leave_periods (status);

create index if not exists idx_employee_leave_periods_start_date
  on public.employee_leave_periods (start_date);

create index if not exists idx_employee_leave_periods_end_date
  on public.employee_leave_periods (end_date);

create index if not exists idx_employee_leave_periods_expected_return_date
  on public.employee_leave_periods (expected_return_date);

-- updated_at automatique
create or replace function public.set_employee_leave_periods_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_employee_leave_periods_updated_at on public.employee_leave_periods;
create trigger trg_employee_leave_periods_updated_at
  before update on public.employee_leave_periods
  for each row execute function public.set_employee_leave_periods_updated_at();

alter table public.employee_leave_periods enable row level security;

comment on table public.employee_leave_periods is
  'Absence longue durée : employé peut rester actif portail ; exclu de la disponibilité effectifs.';

-- Recharger le cache schéma PostgREST (API)
notify pgrst, 'reload schema';
