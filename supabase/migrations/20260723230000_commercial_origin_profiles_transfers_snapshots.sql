-- Bloc 6C: origine commerciale client/revendeur, transferts, snapshot de vente.
-- Additive / rétrocompatible. Ne pas appliquer en production dans ce chantier.
-- Staging seulement après autorisation explicite Martin.
--
-- Audit schéma réel (Phase 1):
--   - aucun registre clients/revendeurs en SQL;
--   - livraisons_planifiees.client / dossiers.client = texte libre opérationnel;
--   - aucune table ventes/facture; sale_id = identifiant opaque futur ledger.
-- commercial_parties = registre commercial léger (origine/commissions), PAS un doublon CRM.
-- organization_id: convention officielle (normalize_organization_id de 6B).

begin;

-- Prérequis 6B (idempotent si déjà présent)
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

-- ---------------------------------------------------------------------------
-- commercial_parties — identité commerciale minimale (client | reseller)
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_parties (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  party_type text not null,
  label text not null,
  external_key text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint commercial_parties_organization_id_check check (
    organization_id ~ '^[a-z0-9_]+$'
  ),
  constraint commercial_parties_party_type_check check (
    party_type in ('client', 'reseller')
  ),
  constraint commercial_parties_label_check check (
    btrim(label) <> ''
  )
);

-- Unicité (organization_id, party_type, external_key).
-- Risque: sans external_source, deux systèmes externes peuvent collisionner
-- sur la même clé dans un même org+type. Ajouter external_source seulement
-- si un second système d intégration est réellement branché.
create unique index if not exists idx_commercial_parties_org_external_key
  on public.commercial_parties (organization_id, party_type, external_key)
  where external_key is not null;

create index if not exists idx_commercial_parties_org_type
  on public.commercial_parties (organization_id, party_type);

comment on table public.commercial_parties is
  'Registre commercial léger client/revendeur pour origine commissions. Pas de CRM complet.';

comment on column public.commercial_parties.organization_id is
  'Identifiant logique multi-tenant (a-z0-9_). = company_context/primary_company. Immuable.';

comment on column public.commercial_parties.label is
  'Nom affiché — jamais utiliser comme clé métier / organization_id.';

comment on column public.commercial_parties.external_key is
  'Réf. externe optionnelle. Unique par (organization_id, party_type). Risque de collision multi-sources sans external_source.';

-- ---------------------------------------------------------------------------
-- commercial_origin_profiles — attribution courante (périodes)
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_origin_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  entity_type text not null,
  entity_id uuid not null references public.commercial_parties (id) on delete restrict,
  commercial_origin text not null,
  developed_by_employee_id bigint null references public.chauffeurs (id) on delete restrict,
  effective_from date not null,
  effective_to date null,
  status text not null default 'active',
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint commercial_origin_profiles_organization_id_check check (
    organization_id ~ '^[a-z0-9_]+$'
  ),
  constraint commercial_origin_profiles_entity_type_check check (
    entity_type in ('client', 'reseller')
  ),
  constraint commercial_origin_profiles_origin_check check (
    commercial_origin in ('existing', 'employee_developed', 'company_developed')
  ),
  constraint commercial_origin_profiles_status_check check (
    status in ('active', 'transferred', 'inactive')
  ),
  constraint commercial_origin_profiles_period_check check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint commercial_origin_profiles_developer_check check (
    (
      commercial_origin = 'employee_developed'
      and developed_by_employee_id is not null
    )
    or (
      commercial_origin in ('existing', 'company_developed')
    )
  )
);

create index if not exists idx_commercial_origin_profiles_entity
  on public.commercial_origin_profiles (
    organization_id, entity_type, entity_id, effective_from desc
  );

create unique index if not exists idx_commercial_origin_profiles_one_open_active
  on public.commercial_origin_profiles (organization_id, entity_type, entity_id)
  where status = 'active' and effective_to is null;

comment on table public.commercial_origin_profiles is
  'Profil d origine commerciale par partie. employee_developed exige developed_by_employee_id.';

comment on column public.commercial_origin_profiles.commercial_origin is
  'existing | employee_developed | company_developed (caché parcours simple V1).';

-- Alignement org/type avec commercial_parties + développeur même tenant
create or replace function public.enforce_commercial_origin_profile_party()
returns trigger
language plpgsql
as $$
declare
  v_party public.commercial_parties%rowtype;
  v_dev_org text;
begin
  select * into v_party
  from public.commercial_parties p
  where p.id = new.entity_id;

  if not found then
    raise exception 'entity_id inconnu';
  end if;

  if v_party.organization_id is distinct from new.organization_id then
    raise exception 'attribution cross-tenant interdite (organization_id)';
  end if;

  if v_party.party_type is distinct from new.entity_type then
    raise exception 'entity_type doit correspondre au party_type';
  end if;

  if public.normalize_organization_id(new.organization_id) is distinct from new.organization_id then
    raise exception 'organization_id non normalisé';
  end if;

  if new.developed_by_employee_id is not null then
    select public.normalize_organization_id(c.primary_company)
      into v_dev_org
    from public.chauffeurs c
    where c.id = new.developed_by_employee_id;

    if v_dev_org is null or v_dev_org is distinct from new.organization_id then
      raise exception 'employé développeur cross-tenant interdit';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_commercial_origin_profiles_party
  on public.commercial_origin_profiles;
create trigger trg_commercial_origin_profiles_party
  before insert or update on public.commercial_origin_profiles
  for each row execute function public.enforce_commercial_origin_profile_party();

-- ---------------------------------------------------------------------------
-- commercial_origin_transfers — historique (ventes futures seulement)
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_origin_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  entity_type text not null,
  entity_id uuid not null references public.commercial_parties (id) on delete restrict,
  from_employee_id bigint not null references public.chauffeurs (id) on delete restrict,
  to_employee_id bigint not null references public.chauffeurs (id) on delete restrict,
  effective_at date not null,
  reason text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint commercial_origin_transfers_organization_id_check check (
    organization_id ~ '^[a-z0-9_]+$'
  ),
  constraint commercial_origin_transfers_entity_type_check check (
    entity_type in ('client', 'reseller')
  ),
  constraint commercial_origin_transfers_employees_distinct_check check (
    from_employee_id is distinct from to_employee_id
  )
);

create index if not exists idx_commercial_origin_transfers_entity_effective
  on public.commercial_origin_transfers (
    organization_id, entity_type, entity_id, effective_at desc
  );

comment on table public.commercial_origin_transfers is
  'Journal + source de résolution: effective_at <= sale_date → to_employee_id (ventes futures). Historique non supprimé.';

create or replace function public.enforce_commercial_origin_transfer_tenant()
returns trigger
language plpgsql
as $$
declare
  v_party public.commercial_parties%rowtype;
  v_from_org text;
  v_to_org text;
begin
  select * into v_party
  from public.commercial_parties p
  where p.id = new.entity_id;

  if not found then
    raise exception 'entity_id inconnu';
  end if;

  if v_party.organization_id is distinct from new.organization_id
    or v_party.party_type is distinct from new.entity_type then
    raise exception 'transfert cross-tenant ou type incohérent';
  end if;

  if public.normalize_organization_id(new.organization_id) is distinct from new.organization_id then
    raise exception 'organization_id non normalisé';
  end if;

  select public.normalize_organization_id(c.primary_company) into v_from_org
  from public.chauffeurs c where c.id = new.from_employee_id;
  select public.normalize_organization_id(c.primary_company) into v_to_org
  from public.chauffeurs c where c.id = new.to_employee_id;

  if v_from_org is distinct from new.organization_id
    or v_to_org is distinct from new.organization_id then
    raise exception 'employés de transfert cross-tenant interdits';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_commercial_origin_transfers_tenant
  on public.commercial_origin_transfers;
create trigger trg_commercial_origin_transfers_tenant
  before insert or update on public.commercial_origin_transfers
  for each row execute function public.enforce_commercial_origin_transfer_tenant();

-- ---------------------------------------------------------------------------
-- sale_commercial_origin_snapshots — preuve historique immuable sur la vente
-- ---------------------------------------------------------------------------
create table if not exists public.sale_commercial_origin_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  sale_id text not null,
  commercial_origin_snapshot text null,
  developed_by_employee_id_snapshot bigint null references public.chauffeurs (id) on delete restrict,
  source_profile_id uuid null references public.commercial_origin_profiles (id) on delete set null,
  captured_at timestamptz not null default timezone('utc', now()),
  captured_by_system boolean not null default true,
  captured_by uuid null references auth.users (id) on delete set null,
  review_status text not null default 'pending_review',
  confirmed_by uuid null references auth.users (id) on delete set null,
  confirmed_at timestamptz null,
  confirmation_reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sale_commercial_origin_snapshots_organization_id_check check (
    organization_id ~ '^[a-z0-9_]+$'
  ),
  constraint sale_commercial_origin_snapshots_sale_id_check check (
    btrim(sale_id) <> ''
  ),
  constraint sale_commercial_origin_snapshots_origin_check check (
    commercial_origin_snapshot is null
    or commercial_origin_snapshot in (
      'existing', 'employee_developed', 'company_developed'
    )
  ),
  constraint sale_commercial_origin_snapshots_review_status_check check (
    review_status in ('confirmed', 'pending_review', 'resolved', 'invalid')
  ),
  constraint sale_commercial_origin_snapshots_org_sale_unique
    unique (organization_id, sale_id)
);

create index if not exists idx_sale_origin_snapshots_review
  on public.sale_commercial_origin_snapshots (organization_id, review_status)
  where review_status = 'pending_review';

comment on table public.sale_commercial_origin_snapshots is
  'Snapshot historique d origine sur une vente (sale_id opaque). File À vérifier = review_status pending_review.';

comment on column public.sale_commercial_origin_snapshots.sale_id is
  'Identifiant opaque du fait de vente futur. Pas de FK legacy (aucun ledger ventes aujourd hui).';

comment on column public.sale_commercial_origin_snapshots.commercial_origin_snapshot is
  'Valeur métier réelle figée (incl. company_developed). Null si pending_review sans résolution.';

comment on column public.sale_commercial_origin_snapshots.review_status is
  'confirmed | pending_review | resolved | invalid. pending_review = À vérifier.';

-- Immutabilité après confirmed/resolved.
-- pending_review → resolved|confirmed|invalid reste autorisé (résolution contrôlée).
create or replace function public.protect_sale_origin_snapshot_history()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id est immuable après création';
  end if;

  if old.review_status in ('confirmed', 'resolved') then
    if new.review_status is distinct from old.review_status
      or new.commercial_origin_snapshot is distinct from old.commercial_origin_snapshot
      or new.developed_by_employee_id_snapshot is distinct from old.developed_by_employee_id_snapshot
      or new.source_profile_id is distinct from old.source_profile_id
      or new.sale_id is distinct from old.sale_id
      or new.captured_at is distinct from old.captured_at
      or new.confirmed_by is distinct from old.confirmed_by
      or new.confirmed_at is distinct from old.confirmed_at
      or new.confirmation_reason is distinct from old.confirmation_reason
    then
      raise exception 'snapshot historique immuable après confirmation/résolution';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sale_origin_snapshot_protect
  on public.sale_commercial_origin_snapshots;
create trigger trg_sale_origin_snapshot_protect
  before update on public.sale_commercial_origin_snapshots
  for each row execute function public.protect_sale_origin_snapshot_history();

-- organization_id immuable sur parties / profiles / transfers
create or replace function public.prevent_commercial_organization_id_change()
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

drop trigger if exists trg_commercial_parties_org_immutable on public.commercial_parties;
create trigger trg_commercial_parties_org_immutable
  before update on public.commercial_parties
  for each row execute function public.prevent_commercial_organization_id_change();

drop trigger if exists trg_commercial_origin_profiles_org_immutable
  on public.commercial_origin_profiles;
create trigger trg_commercial_origin_profiles_org_immutable
  before update on public.commercial_origin_profiles
  for each row execute function public.prevent_commercial_organization_id_change();

drop trigger if exists trg_commercial_origin_transfers_org_immutable
  on public.commercial_origin_transfers;
create trigger trg_commercial_origin_transfers_org_immutable
  before update on public.commercial_origin_transfers
  for each row execute function public.prevent_commercial_organization_id_change();

-- updated_at
drop trigger if exists trg_commercial_parties_updated_at on public.commercial_parties;
create trigger trg_commercial_parties_updated_at
  before update on public.commercial_parties
  for each row execute function public.set_commissions_row_updated_at();

drop trigger if exists trg_commercial_origin_profiles_updated_at
  on public.commercial_origin_profiles;
create trigger trg_commercial_origin_profiles_updated_at
  before update on public.commercial_origin_profiles
  for each row execute function public.set_commissions_row_updated_at();

drop trigger if exists trg_sale_origin_snapshots_updated_at
  on public.sale_commercial_origin_snapshots;
create trigger trg_sale_origin_snapshots_updated_at
  before update on public.sale_commercial_origin_snapshots
  for each row execute function public.set_commissions_row_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (même conventions que 6B)
-- ---------------------------------------------------------------------------
alter table public.commercial_parties enable row level security;
alter table public.commercial_origin_profiles enable row level security;
alter table public.commercial_origin_transfers enable row level security;
alter table public.sale_commercial_origin_snapshots enable row level security;

-- Parties
drop policy if exists "commercial_parties_admin_all" on public.commercial_parties;
create policy "commercial_parties_admin_all"
  on public.commercial_parties for all to authenticated
  using (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  );

drop policy if exists "commercial_parties_direction_select" on public.commercial_parties;
create policy "commercial_parties_direction_select"
  on public.commercial_parties for select to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.user_can_access_commission_organization(organization_id)
  );

-- Profiles
drop policy if exists "commercial_origin_profiles_admin_all"
  on public.commercial_origin_profiles;
create policy "commercial_origin_profiles_admin_all"
  on public.commercial_origin_profiles for all to authenticated
  using (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  );

drop policy if exists "commercial_origin_profiles_direction_select"
  on public.commercial_origin_profiles;
create policy "commercial_origin_profiles_direction_select"
  on public.commercial_origin_profiles for select to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.user_can_access_commission_organization(organization_id)
  );

-- Transfers: Admin write; Direction read (confirm/transfer Direction = permission future)
drop policy if exists "commercial_origin_transfers_admin_all"
  on public.commercial_origin_transfers;
create policy "commercial_origin_transfers_admin_all"
  on public.commercial_origin_transfers for all to authenticated
  using (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  );

drop policy if exists "commercial_origin_transfers_direction_select"
  on public.commercial_origin_transfers;
create policy "commercial_origin_transfers_direction_select"
  on public.commercial_origin_transfers for select to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.user_can_access_commission_organization(organization_id)
  );

-- Snapshots: Admin write/confirm; Direction read (+ future confirm permission)
drop policy if exists "sale_origin_snapshots_admin_all"
  on public.sale_commercial_origin_snapshots;
create policy "sale_origin_snapshots_admin_all"
  on public.sale_commercial_origin_snapshots for all to authenticated
  using (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.user_can_access_commission_organization(organization_id)
  );

drop policy if exists "sale_origin_snapshots_direction_select"
  on public.sale_commercial_origin_snapshots;
create policy "sale_origin_snapshots_direction_select"
  on public.sale_commercial_origin_snapshots for select to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.user_can_access_commission_organization(organization_id)
  );

-- Employé: aucune policy config (lecture vente propre = futur, hors 6C Phase 1)

notify pgrst, 'reload schema';

commit;
