-- TAGORA Compensation Engine Phase 1: Accruals + workflow finance minimal.
-- Fichier migration locale uniquement — ne pas executer en production sans validation explicite.
-- Hors scope: paiement, API, UI, Pay Plans, legacy commission_entries.

begin;

-- ---------------------------------------------------------------------------
-- compensation_accruals
-- ---------------------------------------------------------------------------
create table if not exists public.compensation_accruals (
  id uuid primary key default gen_random_uuid(),
  compensation_event_id uuid not null references public.compensation_events (id) on delete restrict,
  component text not null,
  rule_name text not null,
  label text not null,
  sales_basis_amount numeric(14, 2) not null default 0,
  calculated_amount numeric(14, 2) not null default 0,
  status text not null default 'draft',
  period_start date null,
  period_end date null,
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint compensation_accruals_component_check check (
    component in ('commission', 'bonus', 'correction')
  ),
  constraint compensation_accruals_status_phase1_check check (
    status in ('draft', 'calculated', 'under_review', 'validated')
  )
);

create index if not exists idx_compensation_accruals_event
  on public.compensation_accruals (compensation_event_id);

create index if not exists idx_compensation_accruals_status
  on public.compensation_accruals (status);

create index if not exists idx_compensation_accruals_component
  on public.compensation_accruals (component);

comment on table public.compensation_accruals is
  'Accruals Phase 1 lies aux Compensation Events. Workflow finance minimal Sprint 5.';

-- ---------------------------------------------------------------------------
-- compensation_accrual_status_history
-- ---------------------------------------------------------------------------
create table if not exists public.compensation_accrual_status_history (
  id uuid primary key default gen_random_uuid(),
  accrual_id uuid not null references public.compensation_accruals (id) on delete cascade,
  from_status text null,
  to_status text not null,
  changed_at timestamptz not null default timezone('utc', now()),
  changed_by uuid null references auth.users (id) on delete set null,
  reason text null,
  constraint compensation_accrual_status_history_from_status_check check (
    from_status is null
    or from_status in ('draft', 'calculated', 'under_review', 'validated')
  ),
  constraint compensation_accrual_status_history_to_status_check check (
    to_status in ('draft', 'calculated', 'under_review', 'validated')
  )
);

create index if not exists idx_compensation_accrual_status_history_accrual
  on public.compensation_accrual_status_history (accrual_id, changed_at);

comment on table public.compensation_accrual_status_history is
  'Historique append-only des transitions de statut accrual Phase 1.';

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuse commissions helper when present)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_compensation_accruals_updated_at on public.compensation_accruals;
create trigger trg_compensation_accruals_updated_at
  before update on public.compensation_accruals
  for each row execute function public.set_commissions_row_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: admin finance via service role / admin policies
-- ---------------------------------------------------------------------------
alter table if exists public.compensation_accruals enable row level security;
alter table if exists public.compensation_accrual_status_history enable row level security;

drop policy if exists "compensation_accruals_admin_all" on public.compensation_accruals;
create policy "compensation_accruals_admin_all"
  on public.compensation_accruals
  for all
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "compensation_accrual_status_history_admin_all" on public.compensation_accrual_status_history;
create policy "compensation_accrual_status_history_admin_all"
  on public.compensation_accrual_status_history
  for all
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

notify pgrst, 'reload schema';

commit;
