-- ============================================================
-- 6E.2A — assignments, overrides, conflicts + normalized scopes
-- Multi-active plans allowed; overlap default = block + admin review.
-- No unique(employee_id) alone. No automatic winner. No dual-write.
-- Scope/assignment arrays replaced by tenant-aligned join tables.
-- ============================================================

begin;

create table if not exists public.compensation_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  employee_id bigint not null
    references public.chauffeurs (id)
    on delete restrict,
  plan_version_id uuid not null
    references public.compensation_plan_versions (id)
    on delete restrict,
  status text not null default 'draft',
  effective_from date not null,
  effective_to date null,
  priority integer not null default 0,
  processing_frequency text not null default 'biweekly',
  approver_user_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  created_by uuid null references auth.users (id) on delete set null,
  ended_at timestamptz null,
  ended_by uuid null references auth.users (id) on delete set null,
  constraint compensation_plan_assignments_status_check
    check (status in ('draft', 'active', 'suspended', 'ended')),
  constraint compensation_plan_assignments_priority_check
    check (priority >= 0),
  constraint compensation_plan_assignments_frequency_check
    check (
      processing_frequency in ('biweekly', 'monthly', 'per_sale', 'custom')
    ),
  constraint compensation_plan_assignments_effective_range_check
    check (effective_to is null or effective_to >= effective_from),
  constraint compensation_plan_assignments_ended_consistency_check
    check (
      (status = 'ended' and ended_at is not null)
      or (status <> 'ended')
    )
);

comment on table public.compensation_plan_assignments is
  '6E.2A: Employee assignments to plan versions. Scopes live in compensation_assignment_scopes. Multiple active plans allowed when scopes do not overlap. No automatic winner.';

comment on column public.compensation_plan_assignments.priority is
  'Diagnostic priority only. Never used as a silent winner.';

create index if not exists compensation_plan_assignments_org_idx
  on public.compensation_plan_assignments (organization_id);

create index if not exists compensation_plan_assignments_employee_idx
  on public.compensation_plan_assignments (organization_id, employee_id, status);

create index if not exists compensation_plan_assignments_version_idx
  on public.compensation_plan_assignments (plan_version_id, status);

create index if not exists compensation_plan_assignments_org_active_idx
  on public.compensation_plan_assignments (organization_id, status, effective_from);

create table if not exists public.compensation_assignment_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  assignment_id uuid not null
    references public.compensation_plan_assignments (id)
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
  constraint compensation_assignment_scopes_kind_check
    check (
      scope_kind in (
        'company',
        'product_category',
        'account_class',
        'sales_channel',
        'customer_type'
      )
    ),
  constraint compensation_assignment_scopes_exactly_one_target_check
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
  constraint compensation_assignment_scopes_product_code_check
    check (
      product_category_code is null
      or product_category_code = public.normalize_pay_plan_code(product_category_code)
    ),
  constraint compensation_assignment_scopes_scope_code_check
    check (
      scope_code is null
      or scope_code = public.normalize_pay_plan_code(scope_code)
    )
);

comment on table public.compensation_assignment_scopes is
  '6E.2A: Normalized tenant-aligned assignment scopes. Overlap queryable by rows. No authoritative arrays.';

create unique index if not exists compensation_assignment_scopes_company_uidx
  on public.compensation_assignment_scopes (assignment_id, company_id)
  where scope_kind = 'company';

create unique index if not exists compensation_assignment_scopes_account_class_uidx
  on public.compensation_assignment_scopes (assignment_id, account_class_id)
  where scope_kind = 'account_class';

create unique index if not exists compensation_assignment_scopes_product_uidx
  on public.compensation_assignment_scopes (assignment_id, product_category_code)
  where scope_kind = 'product_category';

create unique index if not exists compensation_assignment_scopes_code_uidx
  on public.compensation_assignment_scopes (assignment_id, scope_kind, scope_code)
  where scope_kind in ('sales_channel', 'customer_type');

create index if not exists compensation_assignment_scopes_org_idx
  on public.compensation_assignment_scopes (organization_id);

create index if not exists compensation_assignment_scopes_assignment_idx
  on public.compensation_assignment_scopes (assignment_id);

create index if not exists compensation_assignment_scopes_kind_idx
  on public.compensation_assignment_scopes (organization_id, scope_kind);

create table if not exists public.compensation_assignment_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  assignment_id uuid not null
    references public.compensation_plan_assignments (id)
    on delete cascade,
  field_key text not null,
  value_numeric numeric(14, 4) null,
  value_text text null,
  value_boolean boolean null,
  reason text not null,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  created_by uuid null references auth.users (id) on delete set null,
  constraint compensation_assignment_overrides_field_key_check
    check (
      field_key in (
        'amount',
        'rate_percent',
        'minimum_amount',
        'maximum_amount',
        'monthly_target_units',
        'processing_frequency',
        'priority',
        'notes'
      )
    ),
  constraint compensation_assignment_overrides_reason_check
    check (pg_catalog.char_length(pg_catalog.btrim(reason)) > 0),
  constraint compensation_assignment_overrides_assignment_field_unique
    unique (assignment_id, field_key)
);

comment on table public.compensation_assignment_overrides is
  '6E.2A: Whitelisted per-assignment overrides. Never mutates template, version, or rule_kind.';

create index if not exists compensation_assignment_overrides_org_idx
  on public.compensation_assignment_overrides (organization_id);

create index if not exists compensation_assignment_overrides_assignment_idx
  on public.compensation_assignment_overrides (assignment_id);

create table if not exists public.compensation_assignment_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  sale_id uuid null,
  sale_line_id uuid null,
  conflict_type text not null default 'overlapping_active_assignments',
  reason text not null,
  status text not null default 'open',
  detected_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users (id) on delete set null,
  resolution text null,
  resolution_notes text null,
  audit_reason text null,
  constraint compensation_assignment_conflicts_type_check
    check (
      conflict_type in (
        'overlapping_active_assignments',
        'double_commission_risk',
        'manual_review_required'
      )
    ),
  constraint compensation_assignment_conflicts_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint compensation_assignment_conflicts_resolution_check
    check (
      resolution is null
      or resolution in (
        'block_and_require_admin_review',
        'resolved_keep_assignment',
        'resolved_end_assignment',
        'resolved_manual'
      )
    ),
  constraint compensation_assignment_conflicts_open_resolution_check
    check (
      (status = 'open' and resolution is null and resolved_at is null)
      or (status <> 'open')
    )
);

comment on table public.compensation_assignment_conflicts is
  '6E.2A: Overlap/conflict headers. Linked assignments live in compensation_assignment_conflict_assignments. Default behavior block_and_require_admin_review. No automatic winner.';

comment on column public.compensation_assignment_conflicts.sale_id is
  'Nullable placeholder until sales tables exist (future 6E.5). No FK yet.';

comment on column public.compensation_assignment_conflicts.sale_line_id is
  'Nullable placeholder until sale line tables exist (future 6E.5). No FK yet.';

create index if not exists compensation_assignment_conflicts_org_idx
  on public.compensation_assignment_conflicts (organization_id, status);

create index if not exists compensation_assignment_conflicts_detected_idx
  on public.compensation_assignment_conflicts (organization_id, detected_at desc);

create table if not exists public.compensation_assignment_conflict_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  conflict_id uuid not null
    references public.compensation_assignment_conflicts (id)
    on delete cascade,
  assignment_id uuid not null
    references public.compensation_plan_assignments (id)
    on delete restrict,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  constraint compensation_assignment_conflict_assignments_unique
    unique (conflict_id, assignment_id)
);

comment on table public.compensation_assignment_conflict_assignments is
  '6E.2A: Tenant-aligned conflict ↔ assignment links. Minimum two links required by future transactional conflict-create service (deferred).';

create index if not exists compensation_assignment_conflict_assignments_org_idx
  on public.compensation_assignment_conflict_assignments (organization_id);

create index if not exists compensation_assignment_conflict_assignments_conflict_idx
  on public.compensation_assignment_conflict_assignments (conflict_id);

create index if not exists compensation_assignment_conflict_assignments_assignment_idx
  on public.compensation_assignment_conflict_assignments (assignment_id);

-- Assignment tenant alignment (employee org + version org)
create or replace function public.enforce_pay_plan_assignment_guards()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_version_org uuid;
  v_employee_org uuid;
begin
  select v.organization_id
  into v_version_org
  from public.compensation_plan_versions as v
  where v.id = new.plan_version_id;

  if v_version_org is null then
    raise exception 'plan_version_id introuvable'
      using errcode = '23503';
  end if;

  if new.organization_id is distinct from v_version_org then
    raise exception 'organization_id must match plan version tenant'
      using errcode = '23514';
  end if;

  select c.organization_id
  into v_employee_org
  from public.chauffeurs as c
  where c.id = new.employee_id;

  if v_employee_org is null then
    raise exception 'employee must have canonical organization_id'
      using errcode = '23514';
  end if;

  if new.organization_id is distinct from v_employee_org then
    raise exception 'employee organization_id must match assignment tenant'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if old.organization_id is distinct from new.organization_id then
      raise exception 'organization_id is immutable after insert'
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'ended' and new.ended_at is null then
    new.ended_at := pg_catalog.timezone('utc', pg_catalog.now());
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_pay_plan_assignment_guards() from public;
revoke all on function public.enforce_pay_plan_assignment_guards() from anon;
revoke all on function public.enforce_pay_plan_assignment_guards() from authenticated;
grant execute on function public.enforce_pay_plan_assignment_guards() to service_role;

drop trigger if exists trg_compensation_plan_assignments_guards
  on public.compensation_plan_assignments;
create trigger trg_compensation_plan_assignments_guards
  before insert or update on public.compensation_plan_assignments
  for each row execute function public.enforce_pay_plan_assignment_guards();

drop trigger if exists trg_compensation_plan_assignments_updated_at
  on public.compensation_plan_assignments;
create trigger trg_compensation_plan_assignments_updated_at
  before update on public.compensation_plan_assignments
  for each row execute function public.set_pay_plan_updated_at();

drop trigger if exists trg_compensation_plan_assignments_org_immutable
  on public.compensation_plan_assignments;
create trigger trg_compensation_plan_assignments_org_immutable
  before update on public.compensation_plan_assignments
  for each row execute function public.prevent_pay_plan_organization_id_change();

create or replace function public.enforce_pay_plan_assignment_scope_guards()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_assignment_org uuid;
  v_company_org uuid;
  v_account_class_org uuid;
begin
  select a.organization_id
  into v_assignment_org
  from public.compensation_plan_assignments as a
  where a.id = coalesce(new.assignment_id, old.assignment_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  if v_assignment_org is null then
    raise exception 'assignment_id introuvable'
      using errcode = '23503';
  end if;

  if new.organization_id is distinct from v_assignment_org then
    raise exception 'organization_id must match parent assignment'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if old.organization_id is distinct from new.organization_id then
      raise exception 'organization_id is immutable after insert'
        using errcode = '23514';
    end if;
    if old.assignment_id is distinct from new.assignment_id then
      raise exception 'assignment_id is immutable after insert'
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

  return new;
end;
$$;

revoke all on function public.enforce_pay_plan_assignment_scope_guards() from public;
revoke all on function public.enforce_pay_plan_assignment_scope_guards() from anon;
revoke all on function public.enforce_pay_plan_assignment_scope_guards() from authenticated;
grant execute on function public.enforce_pay_plan_assignment_scope_guards() to service_role;

drop trigger if exists trg_compensation_assignment_scopes_guards
  on public.compensation_assignment_scopes;
create trigger trg_compensation_assignment_scopes_guards
  before insert or update or delete on public.compensation_assignment_scopes
  for each row execute function public.enforce_pay_plan_assignment_scope_guards();

create or replace function public.enforce_pay_plan_override_guards()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_assignment_org uuid;
begin
  select a.organization_id
  into v_assignment_org
  from public.compensation_plan_assignments as a
  where a.id = new.assignment_id;

  if v_assignment_org is null then
    raise exception 'assignment_id introuvable'
      using errcode = '23503';
  end if;

  if new.organization_id is distinct from v_assignment_org then
    raise exception 'organization_id must match parent assignment'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.organization_id is distinct from new.organization_id then
    raise exception 'organization_id is immutable after insert'
      using errcode = '23514';
  end if;

  if new.field_key in ('rule_kind', 'template_id', 'plan_version_id', 'version_id') then
    raise exception 'override field_key is not whitelisted'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_pay_plan_override_guards() from public;
revoke all on function public.enforce_pay_plan_override_guards() from anon;
revoke all on function public.enforce_pay_plan_override_guards() from authenticated;
grant execute on function public.enforce_pay_plan_override_guards() to service_role;

drop trigger if exists trg_compensation_assignment_overrides_guards
  on public.compensation_assignment_overrides;
create trigger trg_compensation_assignment_overrides_guards
  before insert or update on public.compensation_assignment_overrides
  for each row execute function public.enforce_pay_plan_override_guards();

create or replace function public.enforce_pay_plan_conflict_defaults()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if tg_op = 'UPDATE' and old.organization_id is distinct from new.organization_id then
    raise exception 'organization_id is immutable after insert'
      using errcode = '23514';
  end if;

  if new.status = 'open' then
    new.resolution := null;
    new.resolved_at := null;
    new.resolved_by := null;
  end if;

  if new.status <> 'open' and new.resolution is null then
    raise exception 'resolved conflicts require an explicit resolution'
      using errcode = '23514';
  end if;

  if new.resolution is not null
     and new.resolution not in (
       'block_and_require_admin_review',
       'resolved_keep_assignment',
       'resolved_end_assignment',
       'resolved_manual'
     ) then
    raise exception 'invalid conflict resolution'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_pay_plan_conflict_defaults() from public;
revoke all on function public.enforce_pay_plan_conflict_defaults() from anon;
revoke all on function public.enforce_pay_plan_conflict_defaults() from authenticated;
grant execute on function public.enforce_pay_plan_conflict_defaults() to service_role;

drop trigger if exists trg_compensation_assignment_conflicts_defaults
  on public.compensation_assignment_conflicts;
create trigger trg_compensation_assignment_conflicts_defaults
  before insert or update on public.compensation_assignment_conflicts
  for each row execute function public.enforce_pay_plan_conflict_defaults();

create or replace function public.enforce_pay_plan_conflict_assignment_guards()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_conflict_org uuid;
  v_conflict_status text;
  v_assignment_org uuid;
begin
  select c.organization_id, c.status
  into v_conflict_org, v_conflict_status
  from public.compensation_assignment_conflicts as c
  where c.id = coalesce(new.conflict_id, old.conflict_id);

  select a.organization_id
  into v_assignment_org
  from public.compensation_plan_assignments as a
  where a.id = coalesce(new.assignment_id, old.assignment_id);

  if tg_op = 'DELETE' then
    if v_conflict_status is distinct from 'open' then
      raise exception 'resolved conflicts cannot drop linked assignments'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if v_conflict_org is null then
    raise exception 'conflict_id introuvable'
      using errcode = '23503';
  end if;

  if v_assignment_org is null then
    raise exception 'assignment_id introuvable'
      using errcode = '23503';
  end if;

  if new.organization_id is distinct from v_conflict_org then
    raise exception 'organization_id must match parent conflict'
      using errcode = '23514';
  end if;

  if new.organization_id is distinct from v_assignment_org then
    raise exception 'assignment_id must belong to the same organization as conflict'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if old.organization_id is distinct from new.organization_id
      or old.conflict_id is distinct from new.conflict_id
      or old.assignment_id is distinct from new.assignment_id then
      raise exception 'conflict assignment link identity is immutable'
        using errcode = '23514';
    end if;
  end if;

  if v_conflict_status is distinct from 'open' and tg_op = 'INSERT' then
    raise exception 'resolved conflicts cannot gain linked assignments'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_pay_plan_conflict_assignment_guards() from public;
revoke all on function public.enforce_pay_plan_conflict_assignment_guards() from anon;
revoke all on function public.enforce_pay_plan_conflict_assignment_guards() from authenticated;
grant execute on function public.enforce_pay_plan_conflict_assignment_guards() to service_role;

drop trigger if exists trg_compensation_assignment_conflict_assignments_guards
  on public.compensation_assignment_conflict_assignments;
create trigger trg_compensation_assignment_conflict_assignments_guards
  before insert or update or delete on public.compensation_assignment_conflict_assignments
  for each row execute function public.enforce_pay_plan_conflict_assignment_guards();

-- RLS / FORCE RLS
alter table public.compensation_plan_assignments enable row level security;
alter table public.compensation_plan_assignments force row level security;
alter table public.compensation_assignment_scopes enable row level security;
alter table public.compensation_assignment_scopes force row level security;
alter table public.compensation_assignment_overrides enable row level security;
alter table public.compensation_assignment_overrides force row level security;
alter table public.compensation_assignment_conflicts enable row level security;
alter table public.compensation_assignment_conflicts force row level security;
alter table public.compensation_assignment_conflict_assignments enable row level security;
alter table public.compensation_assignment_conflict_assignments force row level security;

revoke all on table public.compensation_plan_assignments from public;
revoke all on table public.compensation_plan_assignments from anon;
revoke all on table public.compensation_assignment_scopes from public;
revoke all on table public.compensation_assignment_scopes from anon;
revoke all on table public.compensation_assignment_overrides from public;
revoke all on table public.compensation_assignment_overrides from anon;
revoke all on table public.compensation_assignment_conflicts from public;
revoke all on table public.compensation_assignment_conflicts from anon;
revoke all on table public.compensation_assignment_conflict_assignments from public;
revoke all on table public.compensation_assignment_conflict_assignments from anon;

grant select, insert, update on table public.compensation_plan_assignments to authenticated;
grant select, insert, update, delete on table public.compensation_assignment_scopes to authenticated;
grant select, insert, update, delete on table public.compensation_assignment_overrides to authenticated;
grant select, insert, update on table public.compensation_assignment_conflicts to authenticated;
grant select, insert, update, delete on table public.compensation_assignment_conflict_assignments to authenticated;
grant select, insert, update, delete on table public.compensation_plan_assignments to service_role;
grant select, insert, update, delete on table public.compensation_assignment_scopes to service_role;
grant select, insert, update, delete on table public.compensation_assignment_overrides to service_role;
grant select, insert, update, delete on table public.compensation_assignment_conflicts to service_role;
grant select, insert, update, delete on table public.compensation_assignment_conflict_assignments to service_role;

-- Assignments
drop policy if exists compensation_plan_assignments_select on public.compensation_plan_assignments;
create policy compensation_plan_assignments_select
  on public.compensation_plan_assignments for select to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_calculation_review')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
    or (
      public.current_app_role() = 'employe'
      and employee_id = public.current_employee_chauffeur_id()
      and public.current_user_can_access_organization(organization_id)
    )
  );

drop policy if exists compensation_plan_assignments_insert on public.compensation_plan_assignments;
create policy compensation_plan_assignments_insert
  on public.compensation_plan_assignments for insert to authenticated
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
  );

drop policy if exists compensation_plan_assignments_update on public.compensation_plan_assignments;
create policy compensation_plan_assignments_update
  on public.compensation_plan_assignments for update to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
  )
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
  );

-- Assignment scopes
drop policy if exists compensation_assignment_scopes_select on public.compensation_assignment_scopes;
create policy compensation_assignment_scopes_select
  on public.compensation_assignment_scopes for select to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_calculation_review')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
  );

drop policy if exists compensation_assignment_scopes_write on public.compensation_assignment_scopes;
create policy compensation_assignment_scopes_write
  on public.compensation_assignment_scopes for all to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
  )
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
  );

-- Overrides
drop policy if exists compensation_assignment_overrides_select on public.compensation_assignment_overrides;
create policy compensation_assignment_overrides_select
  on public.compensation_assignment_overrides for select to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
  );

drop policy if exists compensation_assignment_overrides_write on public.compensation_assignment_overrides;
create policy compensation_assignment_overrides_write
  on public.compensation_assignment_overrides for all to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
  )
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
  );

-- Conflicts (no bare is_admin_user)
drop policy if exists compensation_assignment_conflicts_select on public.compensation_assignment_conflicts;
create policy compensation_assignment_conflicts_select
  on public.compensation_assignment_conflicts for select to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_calculation_review')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
  );

drop policy if exists compensation_assignment_conflicts_insert on public.compensation_assignment_conflicts;
create policy compensation_assignment_conflicts_insert
  on public.compensation_assignment_conflicts for insert to authenticated
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  );

drop policy if exists compensation_assignment_conflicts_update on public.compensation_assignment_conflicts;
create policy compensation_assignment_conflicts_update
  on public.compensation_assignment_conflicts for update to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or (
      public.is_admin_user()
      and public.current_user_can_access_organization(organization_id)
    )
  )
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or (
      public.is_admin_user()
      and public.current_user_can_access_organization(organization_id)
    )
  );

-- Conflict assignment links
drop policy if exists compensation_assignment_conflict_assignments_select
  on public.compensation_assignment_conflict_assignments;
create policy compensation_assignment_conflict_assignments_select
  on public.compensation_assignment_conflict_assignments for select to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_calculation_review')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
  );

drop policy if exists compensation_assignment_conflict_assignments_write
  on public.compensation_assignment_conflict_assignments;
create policy compensation_assignment_conflict_assignments_write
  on public.compensation_assignment_conflict_assignments for all to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or (
      public.is_admin_user()
      and public.current_user_can_access_organization(organization_id)
    )
  )
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or (
      public.is_admin_user()
      and public.current_user_can_access_organization(organization_id)
    )
  );

notify pgrst, 'reload schema';

commit;
