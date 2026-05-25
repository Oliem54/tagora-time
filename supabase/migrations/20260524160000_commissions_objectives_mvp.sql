-- Module Commission et Objectifs (MVP direction).
-- Ne pas appliquer en production sans validation explicite.

insert into public.app_permissions (slug, label, module_key, description, sort_order)
values (
  'commissions',
  'Commissions',
  'commissions',
  'Acces au module objectifs de vente et commissions.',
  60
)
on conflict (slug) do update
set
  label = excluded.label,
  module_key = excluded.module_key,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- sales_objectives
-- ---------------------------------------------------------------------------
create table if not exists public.sales_objectives (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text null,
  chauffeur_id bigint null references public.chauffeurs (id) on delete set null,
  team_name text null,
  period_start date not null,
  period_end date not null,
  target_type text not null,
  target_amount numeric(14, 2) null,
  target_sales_count integer null,
  achieved_amount numeric(14, 2) not null default 0,
  achieved_sales_count integer not null default 0,
  status text not null default 'draft',
  company_context text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_by_name text null,
  updated_by uuid null references auth.users (id) on delete set null,
  updated_by_name text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_objectives_target_type_check check (
    target_type in ('amount', 'sales_count')
  ),
  constraint sales_objectives_status_check check (
    status in (
      'draft',
      'active',
      'achieved',
      'partially_achieved',
      'behind',
      'cancelled'
    )
  ),
  constraint sales_objectives_period_check check (period_end >= period_start),
  constraint sales_objectives_target_amount_check check (
    (target_type = 'amount' and target_amount is not null and target_amount > 0)
    or (target_type = 'sales_count' and target_sales_count is not null and target_sales_count > 0)
  ),
  constraint sales_objectives_assignment_check check (
    chauffeur_id is not null
    or (team_name is not null and btrim(team_name) <> '')
  )
);

create index if not exists idx_sales_objectives_period
  on public.sales_objectives (period_start, period_end);

create index if not exists idx_sales_objectives_chauffeur
  on public.sales_objectives (chauffeur_id);

create index if not exists idx_sales_objectives_status
  on public.sales_objectives (status);

comment on table public.sales_objectives is
  'Objectifs de vente direction (saisie manuelle v1, sans couplage livraisons).';

-- ---------------------------------------------------------------------------
-- commission_rules
-- ---------------------------------------------------------------------------
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.sales_objectives (id) on delete cascade,
  rule_name text not null default 'Commission',
  rule_type text not null,
  fixed_amount numeric(14, 2) null,
  percentage_rate numeric(8, 4) null,
  tier_config jsonb not null default '[]'::jsonb,
  achievement_bonus_amount numeric(14, 2) null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint commission_rules_rule_type_check check (
    rule_type in ('fixed', 'percentage', 'tier_bonus')
  ),
  constraint commission_rules_fixed_check check (
    rule_type <> 'fixed'
    or (fixed_amount is not null and fixed_amount >= 0)
  ),
  constraint commission_rules_percentage_check check (
    rule_type <> 'percentage'
    or (percentage_rate is not null and percentage_rate >= 0)
  )
);

create index if not exists idx_commission_rules_objective
  on public.commission_rules (objective_id);

comment on column public.commission_rules.tier_config is
  'Paliers JSON v1: [{ "threshold": number, "bonus_amount": number }]';

-- ---------------------------------------------------------------------------
-- commission_entries
-- ---------------------------------------------------------------------------
create table if not exists public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.sales_objectives (id) on delete cascade,
  rule_id uuid null references public.commission_rules (id) on delete set null,
  chauffeur_id bigint null references public.chauffeurs (id) on delete set null,
  team_name text null,
  label text not null,
  period_start date not null,
  period_end date not null,
  sales_basis_amount numeric(14, 2) not null default 0,
  calculated_amount numeric(14, 2) not null default 0,
  status text not null default 'estimated',
  validated_at timestamptz null,
  validated_by uuid null references auth.users (id) on delete set null,
  paid_at timestamptz null,
  paid_by uuid null references auth.users (id) on delete set null,
  notes text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint commission_entries_status_check check (
    status in ('estimated', 'pending_validation', 'paid', 'cancelled')
  )
);

create index if not exists idx_commission_entries_objective
  on public.commission_entries (objective_id);

create index if not exists idx_commission_entries_status
  on public.commission_entries (status);

create index if not exists idx_commission_entries_period
  on public.commission_entries (period_start, period_end);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_commissions_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_sales_objectives_updated_at on public.sales_objectives;
create trigger trg_sales_objectives_updated_at
  before update on public.sales_objectives
  for each row execute function public.set_commissions_row_updated_at();

drop trigger if exists trg_commission_rules_updated_at on public.commission_rules;
create trigger trg_commission_rules_updated_at
  before update on public.commission_rules
  for each row execute function public.set_commissions_row_updated_at();

drop trigger if exists trg_commission_entries_updated_at on public.commission_entries;
create trigger trg_commission_entries_updated_at
  before update on public.commission_entries
  for each row execute function public.set_commissions_row_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (module commissions — direction avec permission)
-- ---------------------------------------------------------------------------
alter table if exists public.sales_objectives enable row level security;
alter table if exists public.commission_rules enable row level security;
alter table if exists public.commission_entries enable row level security;

drop policy if exists "sales_objectives_commissions_policy" on public.sales_objectives;
create policy "sales_objectives_commissions_policy"
  on public.sales_objectives
  for all
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
  )
  with check (
    public.is_direction_user()
    and public.has_app_permission('commissions')
  );

drop policy if exists "commission_rules_commissions_policy" on public.commission_rules;
create policy "commission_rules_commissions_policy"
  on public.commission_rules
  for all
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
  )
  with check (
    public.is_direction_user()
    and public.has_app_permission('commissions')
  );

drop policy if exists "commission_entries_commissions_policy" on public.commission_entries;
create policy "commission_entries_commissions_policy"
  on public.commission_entries
  for all
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
  )
  with check (
    public.is_direction_user()
    and public.has_app_permission('commissions')
  );

notify pgrst, 'reload schema';
