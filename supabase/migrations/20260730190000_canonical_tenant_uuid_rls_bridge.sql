-- Canonical tenant UUID bridge — PHASE 1: additive schema only.
-- Adds nullable organization_id columns + FK + indexes.
-- No helpers, policies, grants, data backfill, or environment UUIDs.
-- RLS hardening is applied later by 20260730191000_canonical_tenant_uuid_rls_hardening.sql.
-- This migration is additive schema only (columns / FK / indexes).
-- Staging backfill is intentionally kept out of supabase/migrations/.
-- Manual controlled script path (review + GO Martin only):
--   supabase/tests/staging_canonical_tenant_uuid_controlled_backfill.sql
-- Do not execute that backfill without explicit GO Martin.

-- ---------------------------------------------------------------------------
-- chauffeurs.organization_id
-- ---------------------------------------------------------------------------
alter table public.chauffeurs
  add column if not exists organization_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chauffeurs_organization_id_fkey'
      and conrelid = 'public.chauffeurs'::regclass
  ) then
    alter table public.chauffeurs
      add constraint chauffeurs_organization_id_fkey
      foreign key (organization_id)
      references public.organizations (id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists idx_chauffeurs_organization_id
  on public.chauffeurs (organization_id);

comment on column public.chauffeurs.organization_id is
  'Canonical SaaS tenant UUID (organizations.id). Nullable until controlled reconciliation. RLS authority for chauffeur-linked data after hardening migration. primary_company remains operational company only.';

-- ---------------------------------------------------------------------------
-- sales_objectives.organization_id
-- ---------------------------------------------------------------------------
alter table public.sales_objectives
  add column if not exists organization_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_objectives_organization_id_fkey'
      and conrelid = 'public.sales_objectives'::regclass
  ) then
    alter table public.sales_objectives
      add constraint sales_objectives_organization_id_fkey
      foreign key (organization_id)
      references public.organizations (id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists idx_sales_objectives_organization_id
  on public.sales_objectives (organization_id);

comment on column public.sales_objectives.organization_id is
  'Team-tenant UUID when chauffeur_id IS NULL. Ignored for tenant resolution when chauffeur_id IS NOT NULL (chauffeur.organization_id wins). Nullable until controlled reconciliation.';

-- ---------------------------------------------------------------------------
-- commission_entries.organization_id
-- ---------------------------------------------------------------------------
alter table public.commission_entries
  add column if not exists organization_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'commission_entries_organization_id_fkey'
      and conrelid = 'public.commission_entries'::regclass
  ) then
    alter table public.commission_entries
      add constraint commission_entries_organization_id_fkey
      foreign key (organization_id)
      references public.organizations (id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists idx_commission_entries_organization_id
  on public.commission_entries (organization_id);

comment on column public.commission_entries.organization_id is
  'Team-tenant UUID when chauffeur_id IS NULL. Ignored for tenant resolution when chauffeur_id IS NOT NULL (chauffeur.organization_id wins). Nullable until controlled reconciliation.';
