-- Bloc 6B: catalogue de catégories de commissions + paramètres par organisation.
-- Additive / rétrocompatible. Ne pas appliquer en production dans ce chantier.
-- Staging seulement après autorisation explicite Martin.
--
-- Tenancy — convention officielle organization_id:
--   trim + lower; caractères [a-z0-9_]; immuable après création;
--   identifiant logique multi-tenant (= company_context / primary_company);
--   jamais le nom affiché de l'organisation.
-- Orgs découvertes au migrate: chauffeurs.primary_company ∪ sales_objectives.company_context.
-- Nouvelle org future: ensure_commission_organization_foundation(slug) au provisioning
-- (aucun hook central tenant n'existe encore — risque SaaS documenté).

begin;

-- ---------------------------------------------------------------------------
-- Helpers multi-tenant (JWT + fiche chauffeur) — réutilise auth.jwt / chauffeurs
-- ---------------------------------------------------------------------------
create or replace function public.normalize_organization_id(p_value text)
returns text
language sql
immutable
as $$
  select case
    when p_value is null then null
    when lower(btrim(p_value)) ~ '^[a-z0-9_]+$' then lower(btrim(p_value))
    else null
  end;
$$;

comment on function public.normalize_organization_id(text) is
  'Normalise organization_id: trim+lower, charset a-z0-9_ uniquement.';

create or replace function public.current_user_organization_ids()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with claims as (
    select
      nullif(btrim(auth.jwt() -> 'app_metadata' ->> 'primary_company'), '') as primary_company,
      nullif(btrim(auth.jwt() -> 'app_metadata' ->> 'company'), '') as company,
      nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'primary_company'), '') as user_primary_company,
      nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'company'), '') as user_company,
      case
        when jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'allowed_companies') = 'array'
          then auth.jwt() -> 'app_metadata' -> 'allowed_companies'
        else '[]'::jsonb
      end as app_allowed,
      case
        when jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'allowed_companies') = 'array'
          then auth.jwt() -> 'user_metadata' -> 'allowed_companies'
        else '[]'::jsonb
      end as user_allowed
  ),
  from_arrays as (
    select nullif(btrim(value), '') as org_id
    from claims,
    lateral jsonb_array_elements_text(app_allowed || user_allowed) as value
  ),
  from_claims as (
    select primary_company as org_id from claims
    union all
    select company from claims
    union all
    select user_primary_company from claims
    union all
    select user_company from claims
  ),
  from_chauffeur as (
    select nullif(btrim(c.primary_company), '') as org_id
    from public.chauffeurs c
    where c.auth_user_id = auth.uid()
  )
  select coalesce(
    (
      select array_agg(distinct public.normalize_organization_id(org_id))
      from (
        select org_id from from_arrays
        union all
        select org_id from from_claims
        union all
        select org_id from from_chauffeur
      ) u
      where public.normalize_organization_id(org_id) is not null
    ),
    '{}'::text[]
  );
$$;

comment on function public.current_user_organization_ids() is
  'Organisation(s) accessibles au user Auth courant (JWT + chauffeurs.primary_company), normalisées.';

create or replace function public.user_can_access_commission_organization(p_organization_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.normalize_organization_id(p_organization_id) is not null
    and public.normalize_organization_id(p_organization_id)
      = any (public.current_user_organization_ids());
$$;

comment on function public.user_can_access_commission_organization(text) is
  'Vrai si organization_id (normalisé) appartient aux organisations du user courant.';

-- ---------------------------------------------------------------------------
-- commission_organization_settings
-- ---------------------------------------------------------------------------
create table if not exists public.commission_organization_settings (
  organization_id text not null,
  currency_code text not null default 'CAD',
  default_percentage_basis text not null default 'net_sales_ex_tax',
  default_warranty_eligible boolean not null default false,
  rounding_precision integer not null default 2,
  rounding_mode text not null default 'half_up',
  default_completion_trigger text not null default 'sale_completed_delivered_or_invoiced',
  simple_commission_plans_enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint commission_organization_settings_pkey primary key (organization_id),
  constraint commission_organization_settings_org_id_check check (
    organization_id ~ '^[a-z0-9_]+$'
  ),
  constraint commission_organization_settings_currency_check check (
    currency_code ~ '^[A-Z]{3}$'
  ),
  constraint commission_organization_settings_percentage_basis_check check (
    default_percentage_basis = 'net_sales_ex_tax'
  ),
  constraint commission_organization_settings_rounding_precision_check check (
    rounding_precision between 0 and 6
  ),
  constraint commission_organization_settings_rounding_mode_check check (
    rounding_mode in ('half_up', 'half_even', 'floor', 'ceil')
  ),
  constraint commission_organization_settings_completion_trigger_check check (
    default_completion_trigger in (
      'sale_completed',
      'product_or_vehicle_delivered',
      'service_completed_and_invoiced',
      'sale_completed_delivered_or_invoiced'
    )
  )
);

comment on table public.commission_organization_settings is
  'Paramètres globaux de commissions par organisation (fondation Bloc 6B).';

comment on column public.commission_organization_settings.organization_id is
  'Identifiant logique multi-tenant (trim+lower, a-z0-9_). = company_context/primary_company. Immuable. Pas le nom affiché.';

comment on column public.commission_organization_settings.currency_code is
  'Code devise ISO 4217 (3 lettres). Défaut CAD pour compatibilité; non exclusif.';

comment on column public.commission_organization_settings.default_percentage_basis is
  'Base %: ventes nettes hors taxes, après rabais, hors transport/frais admin, après retours/crédits.';

comment on column public.commission_organization_settings.default_warranty_eligible is
  'Pièces de garantie admissibles par défaut (false = non admissibles).';

comment on column public.commission_organization_settings.default_completion_trigger is
  'Déclencheur métier futur; non branché au moteur de calcul dans ce bloc.';

comment on column public.commission_organization_settings.simple_commission_plans_enabled is
  'Feature flag / abonnement futur du module plans simples; non branché ici.';

-- ---------------------------------------------------------------------------
-- commission_categories
-- ---------------------------------------------------------------------------
create table if not exists public.commission_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  code text not null,
  label text not null,
  description text null,
  display_order integer not null default 0,
  is_visible boolean not null default true,
  is_active boolean not null default true,
  is_system_default boolean not null default false,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint commission_categories_organization_id_check check (
    organization_id ~ '^[a-z0-9_]+$'
  ),
  constraint commission_categories_code_check check (
    btrim(code) <> ''
    and code = lower(btrim(code))
    and code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint commission_categories_label_check check (
    btrim(label) <> ''
  ),
  constraint commission_categories_display_order_check check (
    display_order >= 0
  ),
  constraint commission_categories_org_code_unique unique (organization_id, code)
);

create index if not exists idx_commission_categories_org_order
  on public.commission_categories (organization_id, display_order, code);

create index if not exists idx_commission_categories_org_active
  on public.commission_categories (organization_id, is_active)
  where is_active = true;

comment on table public.commission_categories is
  'Catalogue de catégories de commissions par organisation (masqué ≠ désactivé).';

comment on column public.commission_categories.organization_id is
  'Identifiant logique multi-tenant (trim+lower, a-z0-9_). = company_context/primary_company. Immuable. Pas le nom affiché.';

comment on column public.commission_categories.is_visible is
  'Masquée: absente de l assistant normal; peut rester historiquement utilisée.';

comment on column public.commission_categories.is_active is
  'Désactivée: non sélectionnable pour de nouveaux plans; anciennes données lisibles.';

comment on column public.commission_categories.is_system_default is
  'Catégorie V1 seedée; personnalisations locales non écrasées par le seed.';

-- ---------------------------------------------------------------------------
-- updated_at (réutilise helper commissions existant)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_commission_organization_settings_updated_at
  on public.commission_organization_settings;
create trigger trg_commission_organization_settings_updated_at
  before update on public.commission_organization_settings
  for each row execute function public.set_commissions_row_updated_at();

drop trigger if exists trg_commission_categories_updated_at
  on public.commission_categories;
create trigger trg_commission_categories_updated_at
  before update on public.commission_categories
  for each row execute function public.set_commissions_row_updated_at();

-- organization_id immuable après création
create or replace function public.prevent_commission_organization_id_change()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id est immuable après création';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_commission_org_settings_org_id_immutable
  on public.commission_organization_settings;
create trigger trg_commission_org_settings_org_id_immutable
  before update on public.commission_organization_settings
  for each row execute function public.prevent_commission_organization_id_change();

drop trigger if exists trg_commission_categories_org_id_immutable
  on public.commission_categories;
create trigger trg_commission_categories_org_id_immutable
  before update on public.commission_categories
  for each row execute function public.prevent_commission_organization_id_change();

-- ---------------------------------------------------------------------------
-- Seed idempotent par organisation
-- ---------------------------------------------------------------------------
create or replace function public.ensure_commission_organization_foundation(
  p_organization_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text := public.normalize_organization_id(p_organization_id);
begin
  if v_org is null then
    raise exception 'organization_id invalide (trim+lower, charset a-z0-9_ uniquement)';
  end if;

  insert into public.commission_organization_settings (organization_id)
  values (v_org)
  on conflict (organization_id) do nothing;

  -- Sept catégories V1. DO NOTHING: ne jamais écraser une catégorie déjà personnalisée.
  insert into public.commission_categories (
    organization_id,
    code,
    label,
    description,
    display_order,
    is_visible,
    is_active,
    is_system_default
  )
  values
    (v_org, 'vehicles', 'Véhicules', null, 10, true, true, true),
    (v_org, 'batteries', 'Batteries', null, 20, true, true, true),
    (v_org, 'parts', 'Pièces', null, 30, true, true, true),
    (v_org, 'service_parts', 'Pièces de service', null, 40, true, true, true),
    (v_org, 'accessories', 'Accessoires', null, 50, true, true, true),
    (v_org, 'service', 'Service', null, 60, true, true, true),
    (v_org, 'other', 'Autre produit ou service', null, 70, true, true, true)
  on conflict (organization_id, code) do nothing;
end;
$$;

comment on function public.ensure_commission_organization_foundation(text) is
  'Crée settings + 7 catégories V1 pour une organisation. Idempotent; n écrase pas le personnalisé.';

-- Seed des organisations déjà présentes dans les données (aucune liste d entreprises figée).
do $$
declare
  r record;
begin
  for r in
    select distinct public.normalize_organization_id(raw_id) as org_id
    from (
      select c.primary_company as raw_id
      from public.chauffeurs c
      where c.primary_company is not null
      union
      select so.company_context as raw_id
      from public.sales_objectives so
      where so.company_context is not null
    ) discovered
    where public.normalize_organization_id(raw_id) is not null
  loop
    perform public.ensure_commission_organization_foundation(r.org_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.commission_organization_settings enable row level security;
alter table public.commission_categories enable row level security;

-- Settings: Admin lecture/écriture de SON organisation; Direction lecture seule.
drop policy if exists "commission_org_settings_admin_all"
  on public.commission_organization_settings;
create policy "commission_org_settings_admin_all"
  on public.commission_organization_settings
  for all
  to authenticated
  using (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  );

drop policy if exists "commission_org_settings_direction_select"
  on public.commission_organization_settings;
create policy "commission_org_settings_direction_select"
  on public.commission_organization_settings
  for select
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.user_can_access_commission_organization(organization_id)
  );

-- Catégories: Admin CRUD org-scoped; Direction lecture; Employé: pas de policy (pas requis 6B).
drop policy if exists "commission_categories_admin_all"
  on public.commission_categories;
create policy "commission_categories_admin_all"
  on public.commission_categories
  for all
  to authenticated
  using (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  );

drop policy if exists "commission_categories_direction_select"
  on public.commission_categories;
create policy "commission_categories_direction_select"
  on public.commission_categories
  for select
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.user_can_access_commission_organization(organization_id)
  );

notify pgrst, 'reload schema';

commit;
