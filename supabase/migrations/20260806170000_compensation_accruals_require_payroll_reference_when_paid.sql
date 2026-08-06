-- TAGORA Time — Accruals: référence de paie obligatoire lorsque status='paid'.
-- Migration stricte locale — ne pas appliquer hors GO Martin.
-- Hors scope: remédiation de données et dates de période/paie obligatoires.

begin;

-- Contrainte stricte : paid exige une payroll_reference non vide après btrim.
-- Les dates payroll_period_start / payroll_period_end / payroll_pay_date restent facultatives.
alter table if exists public.compensation_accruals
  drop constraint if exists compensation_accruals_paid_requires_payroll_reference_check;

alter table if exists public.compensation_accruals
  add constraint compensation_accruals_paid_requires_payroll_reference_check check (
    status <> 'paid'
    or (
      payroll_reference is not null
      and btrim(payroll_reference) <> ''
    )
  );

comment on constraint compensation_accruals_paid_requires_payroll_reference_check
  on public.compensation_accruals is
  'status=paid exige payroll_reference non nulle et non vide; dates de paie facultatives.';

commit;
