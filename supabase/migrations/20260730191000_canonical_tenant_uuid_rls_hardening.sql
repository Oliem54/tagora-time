-- Canonical tenant UUID bridge — PHASE 3: RLS / helpers / privileges hardening.
-- Depends on schema columns from 20260730190000_canonical_tenant_uuid_rls_bridge.sql.
-- No column/FK/index additions. No data backfill. No environment UUIDs.
-- Staging backfill must complete before this migration is applied on staging.

-- ---------------------------------------------------------------------------
-- B/C. Membership helpers (UUID) — SECURITY DEFINER, search_path locked
-- ---------------------------------------------------------------------------
create or replace function public.current_user_membership_organization_ids()
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    (
      select pg_catalog.array_agg(distinct m.organization_id)
      from public.organization_memberships as m
      join public.organizations as o
        on o.id = m.organization_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and o.status = 'active'
        and o.deleted_at is null
    ),
    '{}'::uuid[]
  );
$$;

comment on function public.current_user_membership_organization_ids() is
  'Active membership organization UUIDs for auth.uid(). Source: organization_memberships + organizations only. No user_metadata, primary_company, or company_context.';

create or replace function public.current_user_can_access_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    p_organization_id is not null
    and p_organization_id = any (public.current_user_membership_organization_ids());
$$;

comment on function public.current_user_can_access_organization(uuid) is
  'True only when p_organization_id is among the caller active membership organization UUIDs. NULL never grants access.';

-- Resolve tenant for personal/team commission rows.
-- Personal (chauffeur_id present): chauffeurs.organization_id only — row.organization_id never overrides.
-- Team (chauffeur_id null): row.organization_id.
create or replace function public.resolve_commission_linked_tenant_organization_id(
  p_chauffeur_id bigint,
  p_row_organization_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when p_chauffeur_id is not null then (
      select c.organization_id
      from public.chauffeurs as c
      where c.id = p_chauffeur_id
    )
    else p_row_organization_id
  end;
$$;

comment on function public.resolve_commission_linked_tenant_organization_id(bigint, uuid) is
  'Tenant UUID for sales_objectives/commission_entries: chauffeur.organization_id when chauffeur_id set; else row.organization_id.';

create or replace function public.commission_linked_row_is_readable_for_current_user(
  p_chauffeur_id bigint,
  p_row_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.current_user_can_access_organization(
    public.resolve_commission_linked_tenant_organization_id(
      p_chauffeur_id,
      p_row_organization_id
    )
  );
$$;

comment on function public.commission_linked_row_is_readable_for_current_user(bigint, uuid) is
  'Direction/Admin SELECT gate for personal/team commission-linked rows via resolved tenant UUID.';

-- Write gate: stronger consistency (no cross-tenant attach / no contradictory organization_id).
create or replace function public.commission_linked_row_is_writable_for_current_user(
  p_chauffeur_id bigint,
  p_row_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when p_chauffeur_id is not null then exists (
      select 1
      from public.chauffeurs as c
      where c.id = p_chauffeur_id
        and c.organization_id is not null
        and public.current_user_can_access_organization(c.organization_id)
        and (
          p_row_organization_id is null
          or p_row_organization_id = c.organization_id
        )
    )
    else (
      p_row_organization_id is not null
      and public.current_user_can_access_organization(p_row_organization_id)
    )
  end;
$$;

comment on function public.commission_linked_row_is_writable_for_current_user(bigint, uuid) is
  'Direction/Admin INSERT/UPDATE gate: personal rows require accessible chauffeur org; team rows require accessible non-null organization_id; forbids contradictory organization_id.';

-- Harden legacy text helper: membership -> organizations.slug only.
create or replace function public.current_user_organization_ids()
returns text[]
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    (
      select pg_catalog.array_agg(distinct o.slug)
      from public.organization_memberships as m
      join public.organizations as o
        on o.id = m.organization_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and o.status = 'active'
        and o.deleted_at is null
        and o.slug is not null
    ),
    '{}'::text[]
  );
$$;

comment on function public.current_user_organization_ids() is
  'Legacy text slug helper: active membership organizations.slug only. No user_metadata. No primary_company. Prefer current_user_membership_organization_ids() for UUID RLS.';

create or replace function public.user_can_access_commission_organization(p_organization_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    public.normalize_organization_id(p_organization_id) is not null
    and exists (
      select 1
      from public.organization_memberships as m
      join public.organizations as o
        on o.id = m.organization_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and o.status = 'active'
        and o.deleted_at is null
        and (
          o.slug = public.normalize_organization_id(p_organization_id)
          or replace(o.slug, '-', '_') = public.normalize_organization_id(p_organization_id)
        )
    );
$$;

comment on function public.user_can_access_commission_organization(text) is
  'Catalog/text org access via active membership + organizations.slug (hyphen/underscore tolerant). No user_metadata.';

revoke all on function public.current_user_membership_organization_ids() from public;
revoke all on function public.current_user_membership_organization_ids() from anon;
grant execute on function public.current_user_membership_organization_ids() to authenticated;
grant execute on function public.current_user_membership_organization_ids() to service_role;

revoke all on function public.current_user_can_access_organization(uuid) from public;
revoke all on function public.current_user_can_access_organization(uuid) from anon;
grant execute on function public.current_user_can_access_organization(uuid) to authenticated;
grant execute on function public.current_user_can_access_organization(uuid) to service_role;

revoke all on function public.resolve_commission_linked_tenant_organization_id(bigint, uuid) from public;
revoke all on function public.resolve_commission_linked_tenant_organization_id(bigint, uuid) from anon;
grant execute on function public.resolve_commission_linked_tenant_organization_id(bigint, uuid) to authenticated;
grant execute on function public.resolve_commission_linked_tenant_organization_id(bigint, uuid) to service_role;

revoke all on function public.commission_linked_row_is_readable_for_current_user(bigint, uuid) from public;
revoke all on function public.commission_linked_row_is_readable_for_current_user(bigint, uuid) from anon;
grant execute on function public.commission_linked_row_is_readable_for_current_user(bigint, uuid) to authenticated;
grant execute on function public.commission_linked_row_is_readable_for_current_user(bigint, uuid) to service_role;

revoke all on function public.commission_linked_row_is_writable_for_current_user(bigint, uuid) from public;
revoke all on function public.commission_linked_row_is_writable_for_current_user(bigint, uuid) from anon;
grant execute on function public.commission_linked_row_is_writable_for_current_user(bigint, uuid) to authenticated;
grant execute on function public.commission_linked_row_is_writable_for_current_user(bigint, uuid) to service_role;

revoke all on function public.current_user_organization_ids() from public;
revoke all on function public.current_user_organization_ids() from anon;
grant execute on function public.current_user_organization_ids() to authenticated;
grant execute on function public.current_user_organization_ids() to service_role;

revoke all on function public.user_can_access_commission_organization(text) from public;
revoke all on function public.user_can_access_commission_organization(text) from anon;
grant execute on function public.user_can_access_commission_organization(text) to authenticated;
grant execute on function public.user_can_access_commission_organization(text) to service_role;

-- ---------------------------------------------------------------------------
-- D. chauffeurs policies
-- ---------------------------------------------------------------------------
alter table public.chauffeurs enable row level security;

drop policy if exists "allow all" on public.chauffeurs;
drop policy if exists "allow all " on public.chauffeurs;
drop policy if exists "chauffeurs_select_h5e2c" on public.chauffeurs;
drop policy if exists "chauffeurs_select_policy" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_select" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_insert" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_update" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_delete" on public.chauffeurs;
drop policy if exists "chauffeurs_direction_operational_select" on public.chauffeurs;
drop policy if exists "chauffeurs_employee_select" on public.chauffeurs;
drop policy if exists "chauffeurs_direction_select_tenant" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_select_tenant" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_insert_tenant" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_update_tenant" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_delete_tenant" on public.chauffeurs;

create policy "chauffeurs_employee_select"
  on public.chauffeurs
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy "chauffeurs_direction_select_tenant"
  on public.chauffeurs
  for select
  to authenticated
  using (
    public.is_direction_user()
    and (
      public.has_app_permission('ressources')
      or public.has_app_permission('livraisons')
      or public.has_app_permission('terrain')
      or public.has_app_permission('commissions')
    )
    and public.current_user_can_access_organization(organization_id)
  );

create policy "chauffeurs_admin_select_tenant"
  on public.chauffeurs
  for select
  to authenticated
  using (
    public.is_admin_user()
    and public.current_user_can_access_organization(organization_id)
  );

create policy "chauffeurs_admin_insert_tenant"
  on public.chauffeurs
  for insert
  to authenticated
  with check (
    public.is_admin_user()
    and public.current_user_can_access_organization(organization_id)
  );

create policy "chauffeurs_admin_update_tenant"
  on public.chauffeurs
  for update
  to authenticated
  using (
    public.is_admin_user()
    and public.current_user_can_access_organization(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.current_user_can_access_organization(organization_id)
  );

create policy "chauffeurs_admin_delete_tenant"
  on public.chauffeurs
  for delete
  to authenticated
  using (
    public.is_admin_user()
    and public.current_user_can_access_organization(organization_id)
  );

-- ---------------------------------------------------------------------------
-- E/F. sales_objectives + commission_entries
-- ---------------------------------------------------------------------------
alter table public.sales_objectives enable row level security;
alter table public.commission_entries enable row level security;

drop policy if exists "sales_objectives_commissions_policy" on public.sales_objectives;
drop policy if exists "sales_objectives_employee_select" on public.sales_objectives;
drop policy if exists "sales_objectives_admin_all" on public.sales_objectives;
drop policy if exists "sales_objectives_direction_tenant" on public.sales_objectives;
drop policy if exists "sales_objectives_admin_tenant" on public.sales_objectives;

drop policy if exists "commission_entries_commissions_policy" on public.commission_entries;
drop policy if exists "commission_entries_employee_select" on public.commission_entries;
drop policy if exists "commission_entries_admin_all" on public.commission_entries;
drop policy if exists "commission_entries_direction_tenant" on public.commission_entries;
drop policy if exists "commission_entries_admin_tenant" on public.commission_entries;

create policy "sales_objectives_employee_select"
  on public.sales_objectives
  for select
  to authenticated
  using (
    public.current_app_role() = 'employe'
    and chauffeur_id is not null
    and chauffeur_id = public.current_employee_chauffeur_id()
  );

create policy "sales_objectives_direction_tenant"
  on public.sales_objectives
  for all
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.commission_linked_row_is_readable_for_current_user(
      chauffeur_id,
      organization_id
    )
  )
  with check (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.commission_linked_row_is_writable_for_current_user(
      chauffeur_id,
      organization_id
    )
  );

create policy "sales_objectives_admin_tenant"
  on public.sales_objectives
  for all
  to authenticated
  using (
    public.is_admin_user()
    and public.commission_linked_row_is_readable_for_current_user(
      chauffeur_id,
      organization_id
    )
  )
  with check (
    public.is_admin_user()
    and public.commission_linked_row_is_writable_for_current_user(
      chauffeur_id,
      organization_id
    )
  );

create policy "commission_entries_employee_select"
  on public.commission_entries
  for select
  to authenticated
  using (
    public.current_app_role() = 'employe'
    and chauffeur_id is not null
    and chauffeur_id = public.current_employee_chauffeur_id()
  );

create policy "commission_entries_direction_tenant"
  on public.commission_entries
  for all
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.commission_linked_row_is_readable_for_current_user(
      chauffeur_id,
      organization_id
    )
  )
  with check (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and public.commission_linked_row_is_writable_for_current_user(
      chauffeur_id,
      organization_id
    )
  );

create policy "commission_entries_admin_tenant"
  on public.commission_entries
  for all
  to authenticated
  using (
    public.is_admin_user()
    and public.commission_linked_row_is_readable_for_current_user(
      chauffeur_id,
      organization_id
    )
  )
  with check (
    public.is_admin_user()
    and public.commission_linked_row_is_writable_for_current_user(
      chauffeur_id,
      organization_id
    )
  );

-- ---------------------------------------------------------------------------
-- G. commission_rules — tenant via objective personal/team resolution
-- ---------------------------------------------------------------------------
alter table public.commission_rules enable row level security;

drop policy if exists "commission_rules_commissions_policy" on public.commission_rules;
drop policy if exists "commission_rules_employee_select" on public.commission_rules;
drop policy if exists "commission_rules_admin_all" on public.commission_rules;
drop policy if exists "commission_rules_direction_tenant" on public.commission_rules;
drop policy if exists "commission_rules_admin_tenant" on public.commission_rules;

create policy "commission_rules_employee_select"
  on public.commission_rules
  for select
  to authenticated
  using (
    public.current_app_role() = 'employe'
    and exists (
      select 1
      from public.sales_objectives as so
      where so.id = commission_rules.objective_id
        and so.chauffeur_id is not null
        and so.chauffeur_id = public.current_employee_chauffeur_id()
    )
  );

create policy "commission_rules_direction_tenant"
  on public.commission_rules
  for all
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and exists (
      select 1
      from public.sales_objectives as so
      where so.id = commission_rules.objective_id
        and public.commission_linked_row_is_readable_for_current_user(
          so.chauffeur_id,
          so.organization_id
        )
    )
  )
  with check (
    public.is_direction_user()
    and public.has_app_permission('commissions')
    and exists (
      select 1
      from public.sales_objectives as so
      where so.id = commission_rules.objective_id
        and public.commission_linked_row_is_writable_for_current_user(
          so.chauffeur_id,
          so.organization_id
        )
    )
  );

create policy "commission_rules_admin_tenant"
  on public.commission_rules
  for all
  to authenticated
  using (
    public.is_admin_user()
    and exists (
      select 1
      from public.sales_objectives as so
      where so.id = commission_rules.objective_id
        and public.commission_linked_row_is_readable_for_current_user(
          so.chauffeur_id,
          so.organization_id
        )
    )
  )
  with check (
    public.is_admin_user()
    and exists (
      select 1
      from public.sales_objectives as so
      where so.id = commission_rules.objective_id
        and public.commission_linked_row_is_writable_for_current_user(
          so.chauffeur_id,
          so.organization_id
        )
    )
  );

-- ---------------------------------------------------------------------------
-- H. commission_book_access_grants
-- ---------------------------------------------------------------------------
alter table public.commission_book_access_grants enable row level security;

drop policy if exists "commission_book_access_grants_admin_select" on public.commission_book_access_grants;
drop policy if exists "commission_book_access_grants_admin_insert" on public.commission_book_access_grants;
drop policy if exists "commission_book_access_grants_admin_update" on public.commission_book_access_grants;
drop policy if exists "commission_book_access_grants_admin_select_tenant" on public.commission_book_access_grants;
drop policy if exists "commission_book_access_grants_admin_insert_tenant" on public.commission_book_access_grants;
drop policy if exists "commission_book_access_grants_admin_update_tenant" on public.commission_book_access_grants;

create policy "commission_book_access_grants_admin_select_tenant"
  on public.commission_book_access_grants
  for select
  to authenticated
  using (
    public.is_admin_user()
    and exists (
      select 1
      from public.chauffeurs as c
      where c.id = commission_book_access_grants.owner_chauffeur_id
        and public.current_user_can_access_organization(c.organization_id)
    )
  );

create policy "commission_book_access_grants_admin_insert_tenant"
  on public.commission_book_access_grants
  for insert
  to authenticated
  with check (
    public.is_admin_user()
    and can_edit = false
    and exists (
      select 1
      from public.chauffeurs as c
      where c.id = commission_book_access_grants.owner_chauffeur_id
        and public.current_user_can_access_organization(c.organization_id)
    )
  );

create policy "commission_book_access_grants_admin_update_tenant"
  on public.commission_book_access_grants
  for update
  to authenticated
  using (
    public.is_admin_user()
    and exists (
      select 1
      from public.chauffeurs as c
      where c.id = commission_book_access_grants.owner_chauffeur_id
        and public.current_user_can_access_organization(c.organization_id)
    )
  )
  with check (
    public.is_admin_user()
    and can_edit = false
    and exists (
      select 1
      from public.chauffeurs as c
      where c.id = commission_book_access_grants.owner_chauffeur_id
        and public.current_user_can_access_organization(c.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- J. Table privileges
-- ---------------------------------------------------------------------------
revoke all on table public.chauffeurs from public;
revoke all on table public.chauffeurs from anon;
revoke all on table public.sales_objectives from public;
revoke all on table public.sales_objectives from anon;
revoke all on table public.commission_entries from public;
revoke all on table public.commission_entries from anon;
revoke all on table public.commission_rules from public;
revoke all on table public.commission_rules from anon;
revoke all on table public.commission_book_access_grants from public;
revoke all on table public.commission_book_access_grants from anon;

revoke all on table public.chauffeurs from authenticated;
revoke all on table public.sales_objectives from authenticated;
revoke all on table public.commission_entries from authenticated;
revoke all on table public.commission_rules from authenticated;
revoke all on table public.commission_book_access_grants from authenticated;

grant select, insert, update, delete on table public.chauffeurs to authenticated;
grant select, insert, update, delete on table public.sales_objectives to authenticated;
grant select, insert, update, delete on table public.commission_entries to authenticated;
grant select, insert, update, delete on table public.commission_rules to authenticated;
grant select, insert, update on table public.commission_book_access_grants to authenticated;

grant select, insert, update, delete, references, trigger, truncate
  on table public.chauffeurs to service_role;
grant select, insert, update, delete, references, trigger, truncate
  on table public.sales_objectives to service_role;
grant select, insert, update, delete, references, trigger, truncate
  on table public.commission_entries to service_role;
grant select, insert, update, delete, references, trigger, truncate
  on table public.commission_rules to service_role;
grant select, insert, update, delete, references, trigger, truncate
  on table public.commission_book_access_grants to service_role;

notify pgrst, 'reload schema';
