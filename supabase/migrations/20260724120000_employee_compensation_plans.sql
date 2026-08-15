-- Bloc 6D Phase 1: plans de rémunération employés (plan / versions / règles).
-- Additive / rétrocompatible. Ne pas brancher le moteur. Staging seulement après autorisation.
--
-- Audit:
--   employé = chauffeurs.id (bigint); org = primary_company / organization_id;
--   commission_rules = règles d objectifs (legacy) — non remplacées;
--   commission-plan.shared.ts = modèles TS 6A (réutilisés côté app, pas de table avant ce bloc);
--   catégories = commission_categories (6B); origines = 6C.
-- Bases officielles retenues (pas d invention):
--   net_sales_ex_tax | achieved_amount | achieved_sales_count
--   (net_before_tax → net_sales_ex_tax; quantity → achieved_sales_count)

begin;

-- Exclusion de plages de dates (chevauchements)
create extension if not exists btree_gist;

create or replace function public.normalize_organization_id(p_value text)
returns text language sql immutable as $$
  select case
    when p_value is null then null
    when lower(btrim(p_value)) ~ '^[a-z0-9_]+$' then lower(btrim(p_value))
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- A. employee_compensation_plans
-- ---------------------------------------------------------------------------
create table if not exists public.employee_compensation_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  employee_id bigint not null references public.chauffeurs (id) on delete restrict,
  plan_code text not null,
  name text not null,
  description text null,
  status text not null default 'draft',
  current_version_id uuid null,
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint employee_compensation_plans_organization_id_check check (
    organization_id ~ '^[a-z0-9_]+$'
  ),
  constraint employee_compensation_plans_plan_code_check check (
    plan_code ~ '^[a-z0-9_]{1,64}$'
  ),
  constraint employee_compensation_plans_name_check check (
    btrim(name) <> ''
  ),
  constraint employee_compensation_plans_status_check check (
    status in ('draft', 'active', 'archived')
  ),
  constraint employee_compensation_plans_org_employee_unique
    unique (organization_id, employee_id),
  constraint employee_compensation_plans_org_code_unique
    unique (organization_id, plan_code)
);

create index if not exists idx_employee_compensation_plans_org_status
  on public.employee_compensation_plans (organization_id, status);

comment on table public.employee_compensation_plans is
  'Plan principal de rémunération par employé et organisation. Indépendant du moteur legacy.';

comment on column public.employee_compensation_plans.name is
  'Libellé affiché — distinct de plan_code (clé métier).';

-- ---------------------------------------------------------------------------
-- B. employee_compensation_plan_versions
-- ---------------------------------------------------------------------------
create table if not exists public.employee_compensation_plan_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  plan_id uuid not null references public.employee_compensation_plans (id) on delete restrict,
  version_number integer not null,
  status text not null default 'draft',
  effective_from date not null,
  effective_to date null,
  published_at timestamptz null,
  published_by uuid null references auth.users (id) on delete set null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  notes text null,
  constraint employee_compensation_plan_versions_organization_id_check check (
    organization_id ~ '^[a-z0-9_]+$'
  ),
  constraint employee_compensation_plan_versions_number_check check (
    version_number >= 1
  ),
  constraint employee_compensation_plan_versions_status_check check (
    status in ('draft', 'scheduled', 'active', 'archived', 'cancelled')
  ),
  -- Convention: effective_from inclusif, effective_to exclusif (plage [from, to)).
  constraint employee_compensation_plan_versions_period_check check (
    effective_to is null or effective_to > effective_from
  ),
  constraint employee_compensation_plan_versions_plan_number_unique
    unique (plan_id, version_number)
);

-- Empêche les chevauchements pour versions applicables (draft/cancelled exclus).
alter table public.employee_compensation_plan_versions
  drop constraint if exists employee_compensation_plan_versions_no_overlap;
alter table public.employee_compensation_plan_versions
  add constraint employee_compensation_plan_versions_no_overlap
  exclude using gist (
    plan_id with =,
    daterange(
      effective_from,
      coalesce(effective_to, 'infinity'::date),
      '[)'
    ) with &&
  )
  where (status in ('scheduled', 'active', 'archived'));

create index if not exists idx_employee_comp_plan_versions_plan_dates
  on public.employee_compensation_plan_versions (
    plan_id, effective_from desc, effective_to
  );

create index if not exists idx_employee_comp_plan_versions_org_status
  on public.employee_compensation_plan_versions (organization_id, status);

comment on table public.employee_compensation_plan_versions is
  'Versions historisées. effective_from inclusif, effective_to exclusif. Contenu publié figé.';

comment on column public.employee_compensation_plan_versions.effective_to is
  'Borne exclusive. Null = ouvert. Applicable si from <= date < to.';

-- FK current_version_id (après création versions)
alter table public.employee_compensation_plans
  drop constraint if exists employee_compensation_plans_current_version_fkey;
alter table public.employee_compensation_plans
  add constraint employee_compensation_plans_current_version_fkey
  foreign key (current_version_id)
  references public.employee_compensation_plan_versions (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- C. employee_compensation_plan_rules
-- ---------------------------------------------------------------------------
create table if not exists public.employee_compensation_plan_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  plan_version_id uuid not null
    references public.employee_compensation_plan_versions (id) on delete cascade,
  category_id uuid not null
    references public.commission_categories (id) on delete restrict,
  -- null = applicable à toutes les origines
  commercial_origin text null,
  calculation_basis text not null,
  calculation_method text not null,
  rate_percent numeric(8, 4) null,
  fixed_amount numeric(14, 2) null,
  per_unit_amount numeric(14, 2) null,
  currency_code text null,
  min_amount numeric(14, 2) null,
  max_amount numeric(14, 2) null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint employee_compensation_plan_rules_organization_id_check check (
    organization_id ~ '^[a-z0-9_]+$'
  ),
  constraint employee_compensation_plan_rules_origin_check check (
    commercial_origin is null
    or commercial_origin in ('existing', 'employee_developed', 'company_developed')
  ),
  constraint employee_compensation_plan_rules_basis_check check (
    calculation_basis in (
      'net_sales_ex_tax',
      'achieved_amount',
      'achieved_sales_count'
    )
  ),
  constraint employee_compensation_plan_rules_method_check check (
    calculation_method in ('percentage', 'fixed_amount', 'per_unit')
  ),
  constraint employee_compensation_plan_rules_method_values_check check (
    (
      calculation_method = 'percentage'
      and rate_percent is not null
      and rate_percent >= 0
      and rate_percent <= 100
      and fixed_amount is null and per_unit_amount is null
      and currency_code is null
    )
    or (
      calculation_method = 'fixed_amount'
      and fixed_amount is not null and fixed_amount >= 0
      and rate_percent is null and per_unit_amount is null
      and currency_code is not null
      and currency_code ~ '^[A-Z]{3}$'
    )
    or (
      calculation_method = 'per_unit'
      and per_unit_amount is not null and per_unit_amount >= 0
      and rate_percent is null and fixed_amount is null
      and currency_code is not null
      and currency_code ~ '^[A-Z]{3}$'
    )
  ),
  constraint employee_compensation_plan_rules_currency_check check (
    currency_code is null or currency_code ~ '^[A-Z]{3}$'
  ),
  constraint employee_compensation_plan_rules_minmax_check check (
    min_amount is null or min_amount >= 0
  ),
  constraint employee_compensation_plan_rules_max_check check (
    max_amount is null or max_amount >= 0
  ),
  constraint employee_compensation_plan_rules_minmax_order_check check (
    min_amount is null or max_amount is null or max_amount >= min_amount
  ),
  constraint employee_compensation_plan_rules_display_order_check check (
    display_order >= 0
  )
);

create index if not exists idx_employee_comp_plan_rules_version
  on public.employee_compensation_plan_rules (plan_version_id, display_order);

create index if not exists idx_employee_comp_plan_rules_org_category
  on public.employee_compensation_plan_rules (organization_id, category_id);

comment on table public.employee_compensation_plan_rules is
  'Règles d une version de plan. commercial_origin null = toutes origines.';

comment on column public.employee_compensation_plan_rules.calculation_basis is
  'Bases officielles: net_sales_ex_tax | achieved_amount | achieved_sales_count.';

-- ---------------------------------------------------------------------------
-- Triggers tenant / immutabilité
-- ---------------------------------------------------------------------------
create or replace function public.enforce_employee_compensation_plan_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_emp_org text;
begin
  if public.normalize_organization_id(new.organization_id) is distinct from new.organization_id then
    raise exception 'organization_id non normalisé';
  end if;

  select public.normalize_organization_id(c.primary_company)
    into v_emp_org
  from public.chauffeurs c
  where c.id = new.employee_id;

  if v_emp_org is null or v_emp_org is distinct from new.organization_id then
    raise exception 'employé cross-tenant interdit';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_employee_compensation_plans_tenant
  on public.employee_compensation_plans;
create trigger trg_employee_compensation_plans_tenant
  before insert or update on public.employee_compensation_plans
  for each row execute function public.enforce_employee_compensation_plan_tenant();

create or replace function public.enforce_employee_comp_plan_version_tenant()
returns trigger
language plpgsql
as $$
declare
  v_plan public.employee_compensation_plans%rowtype;
begin
  select * into v_plan from public.employee_compensation_plans where id = new.plan_id;
  if not found then
    raise exception 'plan_id inconnu';
  end if;
  if v_plan.organization_id is distinct from new.organization_id then
    raise exception 'version cross-tenant interdite';
  end if;
  if public.normalize_organization_id(new.organization_id) is distinct from new.organization_id then
    raise exception 'organization_id non normalisé';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employee_comp_plan_versions_tenant
  on public.employee_compensation_plan_versions;
create trigger trg_employee_comp_plan_versions_tenant
  before insert or update on public.employee_compensation_plan_versions
  for each row execute function public.enforce_employee_comp_plan_version_tenant();

-- Contenu métier figé hors draft.
-- Après publication, modifiables seulement: status (workflow), effective_to (fermeture),
-- published_at/published_by (si première publication), updated via statut.
create or replace function public.protect_employee_comp_plan_version_content()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' then
    if new.organization_id is distinct from old.organization_id
      or new.plan_id is distinct from old.plan_id
      or new.version_number is distinct from old.version_number
      or new.effective_from is distinct from old.effective_from
      or new.notes is distinct from old.notes
      or (
        new.effective_to is distinct from old.effective_to
        and not (
          old.effective_to is null
          and new.effective_to is not null
          and new.effective_to > old.effective_from
        )
      )
    then
      raise exception 'version publiée: contenu métier immuable (fermeture effective_to contrôlée seule autorisée)';
    end if;
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id immuable';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_employee_comp_plan_versions_protect
  on public.employee_compensation_plan_versions;
create trigger trg_employee_comp_plan_versions_protect
  before update on public.employee_compensation_plan_versions
  for each row execute function public.protect_employee_comp_plan_version_content();

-- Transitions de statut autorisées
create or replace function public.enforce_employee_comp_plan_version_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    if not (
      (old.status = 'draft' and new.status in ('scheduled', 'active', 'cancelled'))
      or (old.status = 'scheduled' and new.status in ('active', 'cancelled'))
      or (old.status = 'active' and new.status = 'archived')
    ) then
      raise exception 'transition de statut invalide: % → %', old.status, new.status;
    end if;

    if new.status in ('scheduled', 'active') and old.status = 'draft' then
      new.published_at := coalesce(new.published_at, timezone('utc', now()));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employee_comp_plan_versions_status
  on public.employee_compensation_plan_versions;
create trigger trg_employee_comp_plan_versions_status
  before update on public.employee_compensation_plan_versions
  for each row execute function public.enforce_employee_comp_plan_version_status();

create or replace function public.enforce_employee_comp_plan_rule_tenant()
returns trigger
language plpgsql
as $$
declare
  v_version public.employee_compensation_plan_versions%rowtype;
  v_cat public.commission_categories%rowtype;
begin
  select * into v_version
  from public.employee_compensation_plan_versions
  where id = new.plan_version_id;

  if not found then
    raise exception 'plan_version_id inconnu';
  end if;

  if v_version.organization_id is distinct from new.organization_id then
    raise exception 'règle cross-tenant (version) interdite';
  end if;

  if v_version.status <> 'draft' then
    raise exception 'règles figées: version non brouillon';
  end if;

  select * into v_cat from public.commission_categories where id = new.category_id;
  if not found then
    raise exception 'category_id inconnu';
  end if;

  if v_cat.organization_id is distinct from new.organization_id then
    raise exception 'catégorie cross-tenant interdite';
  end if;

  if not v_cat.is_active then
    raise exception 'catégorie inactive non sélectionnable pour une nouvelle règle';
  end if;

  if public.normalize_organization_id(new.organization_id) is distinct from new.organization_id then
    raise exception 'organization_id non normalisé';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_employee_comp_plan_rules_tenant
  on public.employee_compensation_plan_rules;
create trigger trg_employee_comp_plan_rules_tenant
  before insert or update on public.employee_compensation_plan_rules
  for each row execute function public.enforce_employee_comp_plan_rule_tenant();

create or replace function public.protect_employee_comp_plan_rules_delete()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.employee_compensation_plan_versions
  where id = old.plan_version_id;

  if v_status is distinct from 'draft' then
    raise exception 'suppression de règle refusée: version non brouillon';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_employee_comp_plan_rules_delete_protect
  on public.employee_compensation_plan_rules;
create trigger trg_employee_comp_plan_rules_delete_protect
  before delete on public.employee_compensation_plan_rules
  for each row execute function public.protect_employee_comp_plan_rules_delete();

create or replace function public.prevent_employee_comp_org_id_change()
returns trigger language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id est immuable après création';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employee_compensation_plans_org_immutable
  on public.employee_compensation_plans;
create trigger trg_employee_compensation_plans_org_immutable
  before update on public.employee_compensation_plans
  for each row execute function public.prevent_employee_comp_org_id_change();

drop trigger if exists trg_employee_comp_plan_rules_org_immutable
  on public.employee_compensation_plan_rules;
create trigger trg_employee_comp_plan_rules_org_immutable
  before update on public.employee_compensation_plan_rules
  for each row execute function public.prevent_employee_comp_org_id_change();

drop trigger if exists trg_employee_compensation_plans_updated_at
  on public.employee_compensation_plans;
create trigger trg_employee_compensation_plans_updated_at
  before update on public.employee_compensation_plans
  for each row execute function public.set_commissions_row_updated_at();

drop trigger if exists trg_employee_comp_plan_rules_updated_at
  on public.employee_compensation_plan_rules;
create trigger trg_employee_comp_plan_rules_updated_at
  before update on public.employee_compensation_plan_rules
  for each row execute function public.set_commissions_row_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.employee_compensation_plans enable row level security;
alter table public.employee_compensation_plan_versions enable row level security;
alter table public.employee_compensation_plan_rules enable row level security;

drop policy if exists "employee_comp_plans_admin_all"
  on public.employee_compensation_plans;
create policy "employee_comp_plans_admin_all"
  on public.employee_compensation_plans for all to authenticated
  using (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  );

drop policy if exists "employee_comp_plans_direction_select"
  on public.employee_compensation_plans;
create policy "employee_comp_plans_direction_select"
  on public.employee_compensation_plans for select to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.user_can_access_commission_organization(organization_id)
  );

drop policy if exists "employee_comp_plan_versions_admin_all"
  on public.employee_compensation_plan_versions;
create policy "employee_comp_plan_versions_admin_all"
  on public.employee_compensation_plan_versions for all to authenticated
  using (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  );

drop policy if exists "employee_comp_plan_versions_direction_select"
  on public.employee_compensation_plan_versions;
create policy "employee_comp_plan_versions_direction_select"
  on public.employee_compensation_plan_versions for select to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.user_can_access_commission_organization(organization_id)
  );

drop policy if exists "employee_comp_plan_rules_admin_all"
  on public.employee_compensation_plan_rules;
create policy "employee_comp_plan_rules_admin_all"
  on public.employee_compensation_plan_rules for all to authenticated
  using (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  );

drop policy if exists "employee_comp_plan_rules_direction_select"
  on public.employee_compensation_plan_rules;
create policy "employee_comp_plan_rules_direction_select"
  on public.employee_compensation_plan_rules for select to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.user_can_access_commission_organization(organization_id)
  );

-- Employé: lecture propre plan publié = futur (aucune policy write/config ici)

notify pgrst, 'reload schema';

commit;
