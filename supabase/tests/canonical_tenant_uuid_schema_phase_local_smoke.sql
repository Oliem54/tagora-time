-- Local smoke: schema phase only (20260730190000).
-- Verifies columns / FK / indexes exist. Does not apply hardening.
-- Safe on disposable local DB. Do not run on staging/production.

\set ON_ERROR_STOP on

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='chauffeurs' and column_name='organization_id'
      and data_type='uuid' and is_nullable='YES'
  ) then
    raise exception 'SCHEMA_SMOKE_MISSING_CHAUFFEURS_ORGANIZATION_ID';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sales_objectives' and column_name='organization_id'
      and data_type='uuid' and is_nullable='YES'
  ) then
    raise exception 'SCHEMA_SMOKE_MISSING_OBJECTIVES_ORGANIZATION_ID';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='commission_entries' and column_name='organization_id'
      and data_type='uuid' and is_nullable='YES'
  ) then
    raise exception 'SCHEMA_SMOKE_MISSING_ENTRIES_ORGANIZATION_ID';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='chauffeurs_organization_id_fkey'
      and conrelid='public.chauffeurs'::regclass
  ) then
    raise exception 'SCHEMA_SMOKE_MISSING_CHAUFFEURS_FK';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='sales_objectives_organization_id_fkey'
      and conrelid='public.sales_objectives'::regclass
  ) then
    raise exception 'SCHEMA_SMOKE_MISSING_OBJECTIVES_FK';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='commission_entries_organization_id_fkey'
      and conrelid='public.commission_entries'::regclass
  ) then
    raise exception 'SCHEMA_SMOKE_MISSING_ENTRIES_FK';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='idx_chauffeurs_organization_id'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='idx_sales_objectives_organization_id'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='idx_commission_entries_organization_id'
  ) then
    raise exception 'SCHEMA_SMOKE_MISSING_INDEX';
  end if;

  -- Hardening helpers must not be required for schema-only readiness.
  -- (They may already exist on a previously hardened local DB — that is OK.)
  raise notice 'CANONICAL_TENANT_UUID_SCHEMA_PHASE_LOCAL_SMOKE_PASS';
end;
$$;
