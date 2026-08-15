-- Commission rules: explicit commission_basis + per_unit mode.
-- Additive / retrocompatible. Do NOT run on production in this chantier.
-- Staging only after explicit Martin authorization.
-- Backfill: existing rules -> commission_basis = achieved_amount (historical $ basis).

begin;

-- ---------------------------------------------------------------------------
-- Columns (nullable first for safe backfill)
-- ---------------------------------------------------------------------------
alter table public.commission_rules
  add column if not exists commission_basis text;

alter table public.commission_rules
  add column if not exists per_unit_amount numeric(14, 2);

comment on column public.commission_rules.commission_basis is
  'Base de calcul de la commission: achieved_amount | achieved_sales_count. Independant du target_type.';

comment on column public.commission_rules.per_unit_amount is
  'Montant CAD par unite lorsque rule_type = per_unit. Null sinon.';

-- ---------------------------------------------------------------------------
-- Backfill existing rows (historical behaviour = monetary basis)
-- ---------------------------------------------------------------------------
update public.commission_rules
set commission_basis = 'achieved_amount'
where commission_basis is null;

-- ---------------------------------------------------------------------------
-- NOT NULL + default for new inserts
-- ---------------------------------------------------------------------------
alter table public.commission_rules
  alter column commission_basis set default 'achieved_amount';

alter table public.commission_rules
  alter column commission_basis set not null;

-- ---------------------------------------------------------------------------
-- Replace rule_type check to include per_unit
-- ---------------------------------------------------------------------------
alter table public.commission_rules
  drop constraint if exists commission_rules_rule_type_check;

alter table public.commission_rules
  add constraint commission_rules_rule_type_check
  check (rule_type in ('fixed', 'percentage', 'tier_bonus', 'per_unit'));

-- ---------------------------------------------------------------------------
-- commission_basis check
-- ---------------------------------------------------------------------------
alter table public.commission_rules
  drop constraint if exists commission_rules_commission_basis_check;

alter table public.commission_rules
  add constraint commission_rules_commission_basis_check
  check (commission_basis in ('achieved_amount', 'achieved_sales_count'));

-- ---------------------------------------------------------------------------
-- per_unit: units basis + per_unit_amount > 0
-- other rule types: per_unit_amount must be NULL
-- ---------------------------------------------------------------------------
alter table public.commission_rules
  drop constraint if exists commission_rules_per_unit_check;

alter table public.commission_rules
  add constraint commission_rules_per_unit_check
  check (
    (
      rule_type = 'per_unit'
      and commission_basis = 'achieved_sales_count'
      and per_unit_amount is not null
      and per_unit_amount > 0
    )
    or (
      rule_type <> 'per_unit'
      and per_unit_amount is null
    )
  );

commit;
