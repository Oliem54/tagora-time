-- TAGORA Time — Accruals: snapshots comptables de paie (preuves de paiement).
-- Migration additive locale — ne pas appliquer hors GO Martin.
-- Hors scope: contrainte stricte status=paid, mise à jour de données, nouvelle table, calcul.

begin;

alter table if exists public.compensation_accruals
  add column if not exists payroll_reference text null;

alter table if exists public.compensation_accruals
  add column if not exists payroll_period_start date null;

alter table if exists public.compensation_accruals
  add column if not exists payroll_period_end date null;

alter table if exists public.compensation_accruals
  add column if not exists payroll_pay_date date null;

comment on column public.compensation_accruals.payroll_reference is
  'Référence ou numéro de paie saisi à la confirmation de paiement (snapshot comptable).';

comment on column public.compensation_accruals.payroll_period_start is
  'Début de la période de paie associée au paiement (snapshot).';

comment on column public.compensation_accruals.payroll_period_end is
  'Fin de la période de paie associée au paiement (snapshot).';

comment on column public.compensation_accruals.payroll_pay_date is
  'Date de paie associée au paiement (snapshot).';

-- Contrôles de forme uniquement — compatible avec les lignes paid historiques nulles.
alter table if exists public.compensation_accruals
  drop constraint if exists compensation_accruals_payroll_reference_nonempty_check;

alter table if exists public.compensation_accruals
  add constraint compensation_accruals_payroll_reference_nonempty_check check (
    payroll_reference is null
    or btrim(payroll_reference) <> ''
  );

alter table if exists public.compensation_accruals
  drop constraint if exists compensation_accruals_payroll_period_order_check;

alter table if exists public.compensation_accruals
  add constraint compensation_accruals_payroll_period_order_check check (
    payroll_period_start is null
    or payroll_period_end is null
    or payroll_period_start <= payroll_period_end
  );

commit;
