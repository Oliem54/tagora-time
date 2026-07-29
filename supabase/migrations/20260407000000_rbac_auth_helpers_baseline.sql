-- ============================================================
-- TAGORA Time — RBAC auth helpers baseline (local rebuild compatibility)
--
-- Purpose:
--   Fresh Supabase local / migration-from-zero historically failed on
--   20260408_190000_horodateur.sql because RLS policies call these helpers
--   before later migrations create them.
--
-- This file is an idempotent compatibility baseline ONLY:
--   - CREATE OR REPLACE FUNCTION helpers
--   - no tables, no seeds, no tenant hardcodes
--   - no RLS policies and no permissive policy expressions
--
-- Canonical semantics (final state after security hardening):
--   - role: app_metadata.role only (nullif), NOT user_metadata
--   - permissions: coalesce(app_metadata, user_metadata) as in
--     20260524150000_permissions_rls_bootstrap.sql
-- Later migrations re-assert the same helpers via CREATE OR REPLACE.
-- ============================================================

-- Divergence note (diagnostic 2026-07-13):
-- supabase/permissions_and_rls.sql (manual/legacy bootstrap) used
-- coalesce(app_metadata.role, user_metadata.role, '').
-- Migrations 20260429_120000 / 20260429_130000 / 20260525120000 use
-- app_metadata.role only. This baseline follows the final migration state.

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

create or replace function public.current_app_permissions()
returns text[]
language sql
stable
as $$
  select coalesce(
    array(
      select jsonb_array_elements_text(
        coalesce(
          auth.jwt() -> 'app_metadata' -> 'permissions',
          auth.jwt() -> 'user_metadata' -> 'permissions',
          '[]'::jsonb
        )
      )
    ),
    array[]::text[]
  );
$$;

create or replace function public.has_app_permission(p_permission text)
returns boolean
language sql
stable
as $$
  select
    public.current_app_role() = 'direction'
    and p_permission = any(public.current_app_permissions())
    or (
      public.current_app_role() = 'employe'
      and p_permission = any(public.current_app_permissions())
    );
$$;

create or replace function public.is_direction_user()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'direction';
$$;

create or replace function public.is_direction_or_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('direction', 'admin')
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'admin'
$$;
