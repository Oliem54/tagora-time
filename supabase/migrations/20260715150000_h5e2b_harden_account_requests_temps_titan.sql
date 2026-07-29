-- ============================================================
-- H5-E2B forward-only — harden account_requests + temps_titan RLS
--
-- Scope: policies on public.account_requests and public.temps_titan only.
--
-- account_requests:
--   - public INSERT pending only (anon + authenticated), heavily bounded
--   - no public SELECT/UPDATE/DELETE
--   - Direction/Admin SELECT/UPDATE/DELETE via is_direction_or_admin()
--
-- temps_titan:
--   - Admin OR (Direction AND terrain) SELECT/INSERT/UPDATE
--   - no authenticated DELETE
--   - no anon access
--   - no company_context invent before H4
--
-- Forbidden: helpers, views, grants, FORCE/DISABLE RLS, other tables,
-- H5-E2A/C SQL, H5-E2D/F, H4, historical replay, USING/WITH CHECK true,
-- policy ALL, data mutations, notifications.
-- Rollback: restore policy DDL from TEMP snapshots under separate mandate.
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.account_requests') is null then
    raise exception 'H5-E2B STOP: missing public.account_requests';
  end if;
  if to_regclass('public.temps_titan') is null then
    raise exception 'H5-E2B STOP: missing public.temps_titan';
  end if;
end
$$;

alter table public.account_requests enable row level security;
alter table public.temps_titan enable row level security;

-- --- drop known aliases / historical account_requests policies ---
drop policy if exists "anon_insert_account_requests" on public.account_requests;
drop policy if exists "deny_read_account_requests" on public.account_requests;
drop policy if exists "deny_update_account_requests" on public.account_requests;
drop policy if exists account_requests_insert_pending_public on public.account_requests;
drop policy if exists account_requests_select_direction_admin on public.account_requests;
drop policy if exists account_requests_update_direction_admin on public.account_requests;
drop policy if exists account_requests_delete_direction_admin on public.account_requests;
drop policy if exists account_requests_insert_pending_public_h5e2b on public.account_requests;
drop policy if exists account_requests_select_direction_admin_h5e2b on public.account_requests;
drop policy if exists account_requests_update_direction_admin_h5e2b on public.account_requests;
drop policy if exists account_requests_delete_direction_admin_h5e2b on public.account_requests;

-- Public INSERT: legitimate pending request only (no privilege escalation fields)
create policy account_requests_insert_pending_public_h5e2b
on public.account_requests
for insert
to anon, authenticated
with check (
  status = 'pending'
  and assigned_role is null
  and (
    assigned_permissions is null
    or cardinality(assigned_permissions) = 0
  )
  and review_note is null
  and reviewed_by is null
  and reviewed_at is null
  and invited_user_id is null
  and review_lock_token is null
  and review_started_at is null
  and last_error is null
  and btrim(coalesce(full_name, '')) <> ''
  and btrim(coalesce(email, '')) <> ''
  and company in ('oliem_solutions', 'titan_produits_industriels')
  and portal_source in ('employe', 'direction')
  and requested_role in ('employe', 'direction')
  and requested_permissions <@ array[
    'documents',
    'dossiers',
    'terrain',
    'livraisons',
    'ressources',
    'commissions'
  ]::text[]
  and cardinality(requested_permissions) = (
    select count(distinct p)
    from unnest(requested_permissions) as p
  )
  and jsonb_typeof(audit_log) = 'array'
  and jsonb_array_length(audit_log) <= 1
  and (
    jsonb_array_length(audit_log) = 0
    or (
      jsonb_array_length(audit_log) = 1
      and coalesce(audit_log -> 0 ->> 'event', '') = 'request_submitted'
      and coalesce(audit_log -> 0 ->> 'actor', '') = 'requester'
    )
  )
);

create policy account_requests_select_direction_admin_h5e2b
on public.account_requests
for select
to authenticated
using (public.is_direction_or_admin());

create policy account_requests_update_direction_admin_h5e2b
on public.account_requests
for update
to authenticated
using (public.is_direction_or_admin())
with check (public.is_direction_or_admin());

create policy account_requests_delete_direction_admin_h5e2b
on public.account_requests
for delete
to authenticated
using (public.is_direction_or_admin());

-- --- temps_titan: Admin OR (Direction AND terrain); no DELETE authenticated ---
drop policy if exists temps_titan_select_direction_admin on public.temps_titan;
drop policy if exists temps_titan_insert_direction_admin on public.temps_titan;
drop policy if exists temps_titan_update_direction_admin on public.temps_titan;
drop policy if exists "temps_titan_select_policy" on public.temps_titan;
drop policy if exists "temps_titan_insert_policy" on public.temps_titan;
drop policy if exists "temps_titan_delete_policy" on public.temps_titan;
drop policy if exists "temps_titan_admin_select" on public.temps_titan;
drop policy if exists "temps_titan_admin_insert" on public.temps_titan;
drop policy if exists "temps_titan_admin_update" on public.temps_titan;
drop policy if exists "temps_titan_admin_delete" on public.temps_titan;
drop policy if exists temps_titan_select_privileged_h5e2b on public.temps_titan;
drop policy if exists temps_titan_insert_privileged_h5e2b on public.temps_titan;
drop policy if exists temps_titan_update_privileged_h5e2b on public.temps_titan;

create policy temps_titan_select_privileged_h5e2b
on public.temps_titan
for select
to authenticated
using (
  public.current_app_role() = 'admin'
  or (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  )
);

create policy temps_titan_insert_privileged_h5e2b
on public.temps_titan
for insert
to authenticated
with check (
  public.current_app_role() = 'admin'
  or (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  )
);

create policy temps_titan_update_privileged_h5e2b
on public.temps_titan
for update
to authenticated
using (
  public.current_app_role() = 'admin'
  or (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  )
)
with check (
  public.current_app_role() = 'admin'
  or (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  )
);

-- Intentionally no authenticated DELETE on temps_titan.
-- Isolation Oliem/Titan not invented here; tenant isolation remains H4.

commit;
