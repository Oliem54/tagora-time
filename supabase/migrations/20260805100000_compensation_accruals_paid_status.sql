-- TAGORA Time — Accruals: statut paid + horodatage paiement (plans de rémunération).
-- Migration locale uniquement — ne pas appliquer hors GO Martin.
-- Hors scope: calcul, commission_entries, paiement bancaire.

begin;

-- ---------------------------------------------------------------------------
-- compensation_accruals : étendre CHECK status + colonnes paid_at / paid_by
-- ---------------------------------------------------------------------------
alter table if exists public.compensation_accruals
  drop constraint if exists compensation_accruals_status_phase1_check;

alter table if exists public.compensation_accruals
  add constraint compensation_accruals_status_phase1_check check (
    status in ('draft', 'calculated', 'under_review', 'validated', 'paid')
  );

alter table if exists public.compensation_accruals
  add column if not exists paid_at timestamptz null;

alter table if exists public.compensation_accruals
  add column if not exists paid_by uuid null references auth.users (id) on delete set null;

comment on column public.compensation_accruals.paid_at is
  'Horodatage serveur du passage validated → paid (confirmation manuelle).';

comment on column public.compensation_accruals.paid_by is
  'Utilisateur ayant confirmé le paiement (pas un versement bancaire).';

alter table if exists public.compensation_accruals
  drop constraint if exists compensation_accruals_paid_metadata_check;

alter table if exists public.compensation_accruals
  add constraint compensation_accruals_paid_metadata_check check (
    (
      status = 'paid'
      and paid_at is not null
      and paid_by is not null
    )
    or
    (
      status <> 'paid'
      and paid_at is null
      and paid_by is null
    )
  );

-- ---------------------------------------------------------------------------
-- compensation_accrual_status_history : autoriser paid dans from/to
-- ---------------------------------------------------------------------------
alter table if exists public.compensation_accrual_status_history
  drop constraint if exists compensation_accrual_status_history_from_status_check;

alter table if exists public.compensation_accrual_status_history
  add constraint compensation_accrual_status_history_from_status_check check (
    from_status is null
    or from_status in ('draft', 'calculated', 'under_review', 'validated', 'paid')
  );

alter table if exists public.compensation_accrual_status_history
  drop constraint if exists compensation_accrual_status_history_to_status_check;

alter table if exists public.compensation_accrual_status_history
  add constraint compensation_accrual_status_history_to_status_check check (
    to_status in ('draft', 'calculated', 'under_review', 'validated', 'paid')
  );

commit;
