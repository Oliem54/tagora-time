-- ============================================================
-- 6E.2A — rule modules, conditions, tiers, normalized scopes
-- 28 controlled rule kinds. No free-form-only JSON engine.
-- Content frozen when parent version is non-draft.
-- Scope arrays removed; tenant-aligned join rows only.
-- ============================================================

begin;

create table if not exists public.compensation_rule_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  version_id uuid not null
    references public.compensation_plan_versions (id)
    on delete restrict,
  rule_kind text not null,
  display_name text not null,
  priority integer not null default 0,
  amount numeric(14, 2) null,
  rate_percent numeric(8, 4) null,
  minimum_amount numeric(14, 2) null,
  maximum_amount numeric(14, 2) null,
  is_cumulative boolean not null default false,
  requires_admin_approval boolean not null default false,
  requires_accounting_confirmation boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  constraint compensation_rule_modules_rule_kind_check
    check (
      rule_kind in (
        'fixed_amount_per_unit',
        'percentage_of_eligible_sales',
        'percentage_of_gross_profit',
        'minimum_guarantee',
        'progressive_profit_tiers',
        'retroactive_volume_tier',
        'non_retroactive_volume_tier',
        'monthly_volume_bonus',
        'annual_volume_bonus',
        'account_opening_bonus',
        'full_price_bonus',
        'financing_bonus',
        'extended_warranty_bonus',
        'margin_threshold',
        'account_class_rate',
        'product_category_rate',
        'company_rate',
        'sales_channel_rate',
        'shared_sale_split',
        'recoverable_advance',
        'advance_waterfall',
        'adjustment',
        'reversal',
        'credit',
        'return',
        'manual_approval',
        'accounting_confirmation',
        'training_entry_exclusion'
      )
    ),
  constraint compensation_rule_modules_display_name_check
    check (pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 120),
  constraint compensation_rule_modules_priority_check
    check (priority >= 0),
  constraint compensation_rule_modules_amount_check
    check (amount is null or amount >= 0),
  constraint compensation_rule_modules_rate_check
    check (rate_percent is null or (rate_percent >= 0 and rate_percent <= 100)),
  constraint compensation_rule_modules_min_check
    check (minimum_amount is null or minimum_amount >= 0),
  constraint compensation_rule_modules_max_check
    check (maximum_amount is null or maximum_amount >= 0),
  constraint compensation_rule_modules_min_max_check
    check (
      minimum_amount is null
      or maximum_amount is null
      or minimum_amount <= maximum_amount
    ),
  constraint compensation_rule_modules_configuration_object_check
    check (pg_catalog.jsonb_typeof(configuration) = 'object')
);

comment on table public.compensation_rule_modules is
  '6E.2A: Generic rule modules for a plan version. 28 controlled kinds. No employee/brand/company hardcode.';

create index if not exists compensation_rule_modules_org_idx
  on public.compensation_rule_modules (organization_id);

create index if not exists compensation_rule_modules_version_idx
  on public.compensation_rule_modules (version_id, priority);

create index if not exists compensation_rule_modules_kind_idx
  on public.compensation_rule_modules (organization_id, rule_kind);

-- Non-scope condition payload only (scopes live in join table)
create table if not exists public.compensation_rule_conditions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  rule_module_id uuid not null
    references public.compensation_rule_modules (id)
    on delete cascade,
  condition_kind text not null,
  effective_from date null,
  effective_to date null,
  minimum_volume numeric(14, 4) null,
  minimum_margin_percent numeric(8, 4) null,
  advanced_condition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  constraint compensation_rule_conditions_kind_check
    check (
      condition_kind in (
        'scope_set',
        'date_range',
        'minimum_volume',
        'margin',
        'advanced'
      )
    ),
  constraint compensation_rule_conditions_volume_check
    check (minimum_volume is null or minimum_volume >= 0),
  constraint compensation_rule_conditions_margin_check
    check (
      minimum_margin_percent is null
      or (minimum_margin_percent >= 0 and minimum_margin_percent <= 100)
    ),
  constraint compensation_rule_conditions_date_range_check
    check (
      effective_to is null
      or effective_from is null
      or effective_to >= effective_from
    ),
  constraint compensation_rule_conditions_advanced_object_check
    check (pg_catalog.jsonb_typeof(advanced_condition) = 'object')
);

comment on table public.compensation_rule_conditions is
  '6E.2A: Non-array condition payloads. Tenant scopes are normalized in compensation_rule_condition_scopes.';

create index if not exists compensation_rule_conditions_org_idx
  on public.compensation_rule_conditions (organization_id);

create index if not exists compensation_rule_conditions_module_idx
  on public.compensation_rule_conditions (rule_module_id);

create table if not exists public.compensation_rule_tiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  rule_module_id uuid not null
    references public.compensation_rule_modules (id)
    on delete cascade,
  tier_order integer not null,
  threshold_from numeric(14, 4) not null,
  threshold_to numeric(14, 4) null,
  amount numeric(14, 2) null,
  rate_percent numeric(8, 4) null,
  retroactive boolean not null default false,
  cumulative boolean not null default false,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  constraint compensation_rule_tiers_order_check
    check (tier_order >= 0),
  constraint compensation_rule_tiers_from_check
    check (threshold_from >= 0),
  constraint compensation_rule_tiers_range_check
    check (threshold_to is null or threshold_to >= threshold_from),
  constraint compensation_rule_tiers_amount_check
    check (amount is null or amount >= 0),
  constraint compensation_rule_tiers_rate_check
    check (rate_percent is null or (rate_percent >= 0 and rate_percent <= 100)),
  constraint compensation_rule_tiers_module_order_unique
    unique (rule_module_id, tier_order)
);

comment on table public.compensation_rule_tiers is
  '6E.2A: Ordered numeric tiers for progressive/volume rule modules.';

create index if not exists compensation_rule_tiers_org_idx
  on public.compensation_rule_tiers (organization_id);

create index if not exists compensation_rule_tiers_module_idx
  on public.compensation_rule_tiers (rule_module_id, tier_order);

-- Normalized tenant-aligned scopes for rule conditions
create table if not exists public.compensation_rule_condition_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  condition_id uuid not null
    references public.compensation_rule_conditions (id)
    on delete cascade,
  scope_kind text not null,
  company_id uuid null
    references public.organization_companies (id)
    on delete restrict,
  account_class_id uuid null
    references public.compensation_account_classes (id)
    on delete restrict,
  product_category_code text null,
  scope_code text null,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  created_by uuid null references auth.users (id) on delete set null,
  constraint compensation_rule_condition_scopes_kind_check
    check (
      scope_kind in (
        'company',
        'product_category',
        'account_class',
        'sales_channel',
        'customer_type'
      )
    ),
  constraint compensation_rule_condition_scopes_exactly_one_target_check
    check (
      (
        scope_kind = 'company'
        and company_id is not null
        and account_class_id is null
        and product_category_code is null
        and scope_code is null
      )
      or (
        scope_kind = 'account_class'
        and account_class_id is not null
        and company_id is null
        and product_category_code is null
        and scope_code is null
      )
      or (
        scope_kind = 'product_category'
        and product_category_code is not null
        and company_id is null
        and account_class_id is null
        and scope_code is null
      )
      or (
        scope_kind in ('sales_channel', 'customer_type')
        and scope_code is not null
        and company_id is null
        and account_class_id is null
        and product_category_code is null
      )
    ),
  constraint compensation_rule_condition_scopes_product_code_check
    check (
      product_category_code is null
      or product_category_code = public.normalize_pay_plan_code(product_category_code)
    ),
  constraint compensation_rule_condition_scopes_scope_code_check
    check (
      scope_code is null
      or scope_code = public.normalize_pay_plan_code(scope_code)
    )
);

comment on table public.compensation_rule_condition_scopes is
  '6E.2A: Normalized tenant-aligned rule condition scopes. No authoritative arrays. product_category/sales_channel/customer_type use controlled codes until UUID catalogs exist.';

comment on column public.compensation_rule_condition_scopes.product_category_code is
  'Controlled code only. commission_categories uses text organization_id today; no safe UUID FK yet.';

create unique index if not exists compensation_rule_condition_scopes_company_uidx
  on public.compensation_rule_condition_scopes (condition_id, company_id)
  where scope_kind = 'company';

create unique index if not exists compensation_rule_condition_scopes_account_class_uidx
  on public.compensation_rule_condition_scopes (condition_id, account_class_id)
  where scope_kind = 'account_class';

create unique index if not exists compensation_rule_condition_scopes_product_uidx
  on public.compensation_rule_condition_scopes (condition_id, product_category_code)
  where scope_kind = 'product_category';

create unique index if not exists compensation_rule_condition_scopes_code_uidx
  on public.compensation_rule_condition_scopes (condition_id, scope_kind, scope_code)
  where scope_kind in ('sales_channel', 'customer_type');

create index if not exists compensation_rule_condition_scopes_org_idx
  on public.compensation_rule_condition_scopes (organization_id);

create index if not exists compensation_rule_condition_scopes_condition_idx
  on public.compensation_rule_condition_scopes (condition_id);

create index if not exists compensation_rule_condition_scopes_kind_idx
  on public.compensation_rule_condition_scopes (organization_id, scope_kind);

-- Module guards
create or replace function public.enforce_pay_plan_rule_module_guards()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_version_org uuid;
begin
  select v.organization_id
  into v_version_org
  from public.compensation_plan_versions as v
  where v.id = coalesce(new.version_id, old.version_id);

  if tg_op = 'DELETE' then
    if public.pay_plan_version_is_content_locked(old.version_id) then
      raise exception 'rule modules are frozen for non-draft versions'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if v_version_org is null then
    raise exception 'version_id introuvable'
      using errcode = '23503';
  end if;

  if new.organization_id is distinct from v_version_org then
    raise exception 'organization_id must match parent version'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.organization_id is distinct from new.organization_id then
    raise exception 'organization_id is immutable after insert'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.version_id is distinct from new.version_id then
    raise exception 'version_id is immutable after insert'
      using errcode = '23514';
  end if;

  if public.pay_plan_version_is_content_locked(new.version_id) then
    raise exception 'rule modules are frozen for non-draft versions'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_pay_plan_rule_module_guards() from public;
revoke all on function public.enforce_pay_plan_rule_module_guards() from anon;
revoke all on function public.enforce_pay_plan_rule_module_guards() from authenticated;
grant execute on function public.enforce_pay_plan_rule_module_guards() to service_role;

drop trigger if exists trg_compensation_rule_modules_guards
  on public.compensation_rule_modules;
create trigger trg_compensation_rule_modules_guards
  before insert or update or delete on public.compensation_rule_modules
  for each row execute function public.enforce_pay_plan_rule_module_guards();

drop trigger if exists trg_compensation_rule_modules_updated_at
  on public.compensation_rule_modules;
create trigger trg_compensation_rule_modules_updated_at
  before update on public.compensation_rule_modules
  for each row execute function public.set_pay_plan_updated_at();

-- Conditions/tiers inherit module lock via parent module version
create or replace function public.enforce_pay_plan_rule_child_guards()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_module_org uuid;
  v_version_id uuid;
begin
  select m.organization_id, m.version_id
  into v_module_org, v_version_id
  from public.compensation_rule_modules as m
  where m.id = coalesce(new.rule_module_id, old.rule_module_id);

  if tg_op = 'DELETE' then
    if public.pay_plan_version_is_content_locked(v_version_id) then
      raise exception 'rule child rows are frozen for non-draft versions'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if v_module_org is null then
    raise exception 'rule_module_id introuvable'
      using errcode = '23503';
  end if;

  if new.organization_id is distinct from v_module_org then
    raise exception 'organization_id must match parent rule module'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.organization_id is distinct from new.organization_id then
    raise exception 'organization_id is immutable after insert'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.rule_module_id is distinct from new.rule_module_id then
    raise exception 'rule_module_id is immutable after insert'
      using errcode = '23514';
  end if;

  if public.pay_plan_version_is_content_locked(v_version_id) then
    raise exception 'rule child rows are frozen for non-draft versions'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_pay_plan_rule_child_guards() from public;
revoke all on function public.enforce_pay_plan_rule_child_guards() from anon;
revoke all on function public.enforce_pay_plan_rule_child_guards() from authenticated;
grant execute on function public.enforce_pay_plan_rule_child_guards() to service_role;

drop trigger if exists trg_compensation_rule_conditions_guards
  on public.compensation_rule_conditions;
create trigger trg_compensation_rule_conditions_guards
  before insert or update or delete on public.compensation_rule_conditions
  for each row execute function public.enforce_pay_plan_rule_child_guards();

drop trigger if exists trg_compensation_rule_tiers_guards
  on public.compensation_rule_tiers;
create trigger trg_compensation_rule_tiers_guards
  before insert or update or delete on public.compensation_rule_tiers
  for each row execute function public.enforce_pay_plan_rule_child_guards();

-- Scope rows: condition tenant + target tenant + active freeze
create or replace function public.enforce_pay_plan_rule_condition_scope_guards()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_condition_org uuid;
  v_module_id uuid;
  v_version_id uuid;
  v_company_org uuid;
  v_account_class_org uuid;
begin
  select c.organization_id, c.rule_module_id
  into v_condition_org, v_module_id
  from public.compensation_rule_conditions as c
  where c.id = coalesce(new.condition_id, old.condition_id);

  select m.version_id
  into v_version_id
  from public.compensation_rule_modules as m
  where m.id = v_module_id;

  if tg_op = 'DELETE' then
    if public.pay_plan_version_is_content_locked(v_version_id) then
      raise exception 'rule condition scopes are frozen for non-draft versions'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if v_condition_org is null then
    raise exception 'condition_id introuvable'
      using errcode = '23503';
  end if;

  if new.organization_id is distinct from v_condition_org then
    raise exception 'organization_id must match parent condition'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if old.organization_id is distinct from new.organization_id then
      raise exception 'organization_id is immutable after insert'
        using errcode = '23514';
    end if;
    if old.condition_id is distinct from new.condition_id then
      raise exception 'condition_id is immutable after insert'
        using errcode = '23514';
    end if;
  end if;

  if new.company_id is not null then
    select oc.organization_id
    into v_company_org
    from public.organization_companies as oc
    where oc.id = new.company_id;
    if v_company_org is null then
      raise exception 'company_id introuvable'
        using errcode = '23503';
    end if;
    if v_company_org is distinct from new.organization_id then
      raise exception 'company_id must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;

  if new.account_class_id is not null then
    select ac.organization_id
    into v_account_class_org
    from public.compensation_account_classes as ac
    where ac.id = new.account_class_id;
    if v_account_class_org is null then
      raise exception 'account_class_id introuvable'
        using errcode = '23503';
    end if;
    if v_account_class_org is distinct from new.organization_id then
      raise exception 'account_class_id must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;

  if public.pay_plan_version_is_content_locked(v_version_id) then
    raise exception 'rule condition scopes are frozen for non-draft versions'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_pay_plan_rule_condition_scope_guards() from public;
revoke all on function public.enforce_pay_plan_rule_condition_scope_guards() from anon;
revoke all on function public.enforce_pay_plan_rule_condition_scope_guards() from authenticated;
grant execute on function public.enforce_pay_plan_rule_condition_scope_guards() to service_role;

drop trigger if exists trg_compensation_rule_condition_scopes_guards
  on public.compensation_rule_condition_scopes;
create trigger trg_compensation_rule_condition_scopes_guards
  before insert or update or delete on public.compensation_rule_condition_scopes
  for each row execute function public.enforce_pay_plan_rule_condition_scope_guards();

-- RLS / FORCE RLS
alter table public.compensation_rule_modules enable row level security;
alter table public.compensation_rule_modules force row level security;
alter table public.compensation_rule_conditions enable row level security;
alter table public.compensation_rule_conditions force row level security;
alter table public.compensation_rule_tiers enable row level security;
alter table public.compensation_rule_tiers force row level security;
alter table public.compensation_rule_condition_scopes enable row level security;
alter table public.compensation_rule_condition_scopes force row level security;

revoke all on table public.compensation_rule_modules from public;
revoke all on table public.compensation_rule_modules from anon;
revoke all on table public.compensation_rule_conditions from public;
revoke all on table public.compensation_rule_conditions from anon;
revoke all on table public.compensation_rule_tiers from public;
revoke all on table public.compensation_rule_tiers from anon;
revoke all on table public.compensation_rule_condition_scopes from public;
revoke all on table public.compensation_rule_condition_scopes from anon;

grant select, insert, update, delete on table public.compensation_rule_modules to authenticated;
grant select, insert, update, delete on table public.compensation_rule_conditions to authenticated;
grant select, insert, update, delete on table public.compensation_rule_tiers to authenticated;
grant select, insert, update, delete on table public.compensation_rule_condition_scopes to authenticated;
grant select, insert, update, delete on table public.compensation_rule_modules to service_role;
grant select, insert, update, delete on table public.compensation_rule_conditions to service_role;
grant select, insert, update, delete on table public.compensation_rule_tiers to service_role;
grant select, insert, update, delete on table public.compensation_rule_condition_scopes to service_role;

drop policy if exists compensation_rule_modules_select on public.compensation_rule_modules;
create policy compensation_rule_modules_select
  on public.compensation_rule_modules for select to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_calculation_review')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
  );

drop policy if exists compensation_rule_modules_write on public.compensation_rule_modules;
create policy compensation_rule_modules_write
  on public.compensation_rule_modules for all to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  )
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  );

drop policy if exists compensation_rule_conditions_select on public.compensation_rule_conditions;
create policy compensation_rule_conditions_select
  on public.compensation_rule_conditions for select to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_calculation_review')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
  );

drop policy if exists compensation_rule_conditions_write on public.compensation_rule_conditions;
create policy compensation_rule_conditions_write
  on public.compensation_rule_conditions for all to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  )
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  );

drop policy if exists compensation_rule_tiers_select on public.compensation_rule_tiers;
create policy compensation_rule_tiers_select
  on public.compensation_rule_tiers for select to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_calculation_review')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
  );

drop policy if exists compensation_rule_tiers_write on public.compensation_rule_tiers;
create policy compensation_rule_tiers_write
  on public.compensation_rule_tiers for all to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  )
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  );

drop policy if exists compensation_rule_condition_scopes_select
  on public.compensation_rule_condition_scopes;
create policy compensation_rule_condition_scopes_select
  on public.compensation_rule_condition_scopes for select to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_calculation_review')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
  );

drop policy if exists compensation_rule_condition_scopes_write
  on public.compensation_rule_condition_scopes;
create policy compensation_rule_condition_scopes_write
  on public.compensation_rule_condition_scopes for all to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  )
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  );

notify pgrst, 'reload schema';

commit;
