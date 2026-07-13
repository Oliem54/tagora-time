-- SaaS 1B.1 local verification script (NOT a migration).
-- Run only against local Postgres after foundation migrations are applied.
-- Example:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f scripts/saas1b1-local-verify.sql
--
-- Does not seed Groupe Oliem. Does not touch business tables.

\echo '=== SaaS 1B.1 foundation tables ==='
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'organizations',
    'organization_companies',
    'organization_settings',
    'organization_memberships',
    'organization_invitations',
    'platform_access',
    'platform_access_audit'
  )
order by table_name;

\echo '=== RLS enabled ==='
select c.relname as table_name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'organizations',
    'organization_companies',
    'organization_settings',
    'organization_memberships',
    'organization_invitations',
    'platform_access',
    'platform_access_audit'
  )
order by 1;

\echo '=== No permissive policies for anon/authenticated (expect 0 rows) ==='
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'organizations',
    'organization_companies',
    'organization_settings',
    'organization_memberships',
    'organization_invitations',
    'platform_access',
    'platform_access_audit'
  );

\echo '=== Business tables must not gain organization_id in 1B.1 ==='
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'chauffeurs',
    'account_requests',
    'horodateur_events',
    'livraisons_planifiees',
    'compensation_events',
    'temps_titan'
  )
  and column_name = 'organization_id';
