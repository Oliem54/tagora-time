-- ============================================================
-- TAGORA Time - RLS minimal (app_metadata.role only)
-- Tables: public.account_requests, public.temps_titan
-- Re-runnable script
-- ============================================================

begin;

-- 1) Helper: current_app_role() from app_metadata.role only
create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

-- 2) Helper: is_direction_or_admin()
create or replace function public.is_direction_or_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('direction', 'admin')
$$;

-- 3) Enable RLS on target tables
alter table public.account_requests enable row level security;
alter table public.temps_titan enable row level security;

-- ============================================================
-- account_requests policies
-- ============================================================

drop policy if exists account_requests_insert_pending_public on public.account_requests;
drop policy if exists account_requests_select_direction_admin on public.account_requests;
drop policy if exists account_requests_update_direction_admin on public.account_requests;
drop policy if exists account_requests_delete_direction_admin on public.account_requests;

-- Public INSERT only for fresh pending requests (no review fields prefilled)
create policy account_requests_insert_pending_public
on public.account_requests
for insert
to public
with check (
  status = 'pending'
  and coalesce(assigned_role::text, '') = ''
  and (
    assigned_permissions is null
    or coalesce(array_length(assigned_permissions, 1), 0) = 0
  )
  and review_note is null
  and reviewed_by is null
  and reviewed_at is null
  and invited_user_id is null
  and review_lock_token is null
  and review_started_at is null
  and last_error is null
);

-- SELECT / UPDATE / DELETE only for direction/admin
create policy account_requests_select_direction_admin
on public.account_requests
for select
to authenticated
using (public.is_direction_or_admin());

create policy account_requests_update_direction_admin
on public.account_requests
for update
to authenticated
using (public.is_direction_or_admin())
with check (public.is_direction_or_admin());

create policy account_requests_delete_direction_admin
on public.account_requests
for delete
to authenticated
using (public.is_direction_or_admin());

-- ============================================================
-- temps_titan policies
-- ============================================================

drop policy if exists temps_titan_select_direction_admin on public.temps_titan;
drop policy if exists temps_titan_insert_direction_admin on public.temps_titan;
drop policy if exists temps_titan_update_direction_admin on public.temps_titan;

-- SELECT / INSERT / UPDATE only for direction/admin
create policy temps_titan_select_direction_admin
on public.temps_titan
for select
to authenticated
using (public.is_direction_or_admin());

create policy temps_titan_insert_direction_admin
on public.temps_titan
for insert
to authenticated
with check (public.is_direction_or_admin());

create policy temps_titan_update_direction_admin
on public.temps_titan
for update
to authenticated
using (public.is_direction_or_admin())
with check (public.is_direction_or_admin());

-- Intentionally no DELETE policy on temps_titan for now.

commit;
