-- ============================================================
-- H5-E2A forward-only — harden authorization helpers
--
-- Scope (only these five functions):
--   public.current_app_role()
--   public.current_app_permissions()
--   public.is_direction_or_admin()
--   public.is_direction_user()
--   public.has_app_permission(text)
--
-- Changes:
--   - role from auth.jwt() -> app_metadata ->> role only
--   - permissions from auth.jwt() -> app_metadata -> permissions only
--   - no user_metadata fallback
--   - SECURITY INVOKER + SET search_path = pg_catalog
--   - REVOKE EXECUTE from PUBLIC and anon
--   - GRANT EXECUTE to authenticated and service_role
--
-- Forbidden: policies, views, tables, triggers, seeds, data,
-- SECURITY DEFINER, other E2 lots, later H5-F, H4, historical replay.
-- ============================================================

begin;

create or replace function public.current_app_role()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

create or replace function public.current_app_permissions()
returns text[]
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(
    array(
      select pg_catalog.jsonb_array_elements_text(
        coalesce(
          auth.jwt() -> 'app_metadata' -> 'permissions',
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
security invoker
set search_path = pg_catalog
as $$
  select
    public.current_app_role() = 'direction'
    and p_permission = any (public.current_app_permissions())
    or (
      public.current_app_role() = 'employe'
      and p_permission = any (public.current_app_permissions())
    );
$$;

create or replace function public.is_direction_user()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select public.current_app_role() = 'direction';
$$;

create or replace function public.is_direction_or_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(public.current_app_role() in ('direction', 'admin'), false);
$$;

comment on function public.current_app_role() is
  'H5-E2A: reads role only from auth.jwt()->app_metadata->>role. user_metadata forbidden for authorization. SECURITY INVOKER. search_path=pg_catalog.';

comment on function public.current_app_permissions() is
  'H5-E2A: reads permissions only from auth.jwt()->app_metadata->permissions. Absent permissions return empty text[]. user_metadata forbidden for authorization. SECURITY INVOKER. search_path=pg_catalog.';

comment on function public.has_app_permission(text) is
  'H5-E2A: direction or employe with matching app_metadata permission only; no automatic admin elevation. SECURITY INVOKER. search_path=pg_catalog.';

comment on function public.is_direction_user() is
  'H5-E2A: true when current_app_role() = direction (app_metadata only). SECURITY INVOKER. search_path=pg_catalog.';

comment on function public.is_direction_or_admin() is
  'H5-E2A: true when current_app_role() in (direction, admin) from app_metadata only. SECURITY INVOKER. search_path=pg_catalog.';

revoke all on function public.current_app_role() from public;
revoke all on function public.current_app_role() from anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_app_role() to service_role;

revoke all on function public.current_app_permissions() from public;
revoke all on function public.current_app_permissions() from anon;
grant execute on function public.current_app_permissions() to authenticated;
grant execute on function public.current_app_permissions() to service_role;

revoke all on function public.has_app_permission(text) from public;
revoke all on function public.has_app_permission(text) from anon;
grant execute on function public.has_app_permission(text) to authenticated;
grant execute on function public.has_app_permission(text) to service_role;

revoke all on function public.is_direction_user() from public;
revoke all on function public.is_direction_user() from anon;
grant execute on function public.is_direction_user() to authenticated;
grant execute on function public.is_direction_user() to service_role;

revoke all on function public.is_direction_or_admin() from public;
revoke all on function public.is_direction_or_admin() from anon;
grant execute on function public.is_direction_or_admin() to authenticated;
grant execute on function public.is_direction_or_admin() to service_role;

commit;
