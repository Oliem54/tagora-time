-- Phase 4D Lot 2 — generic tenant keys for Time operational tables.
-- Forward-only, additive migration. Legacy company text columns remain in place
-- as compatibility projections of organization_companies.company_code.

begin;

-- 1. Composite target used to prove that a company belongs to the row tenant.
create unique index if not exists organization_companies_id_organization_uidx
  on public.organization_companies (id, organization_id);

-- 2. Add canonical tenant keys as nullable for a safe backfill.
alter table public.chauffeurs
  add column if not exists organization_id uuid null,
  add column if not exists organization_company_id uuid null;

alter table public.gps_bases
  add column if not exists organization_id uuid null,
  add column if not exists organization_company_id uuid null;

alter table public.horodateur_events
  add column if not exists organization_id uuid null,
  add column if not exists organization_company_id uuid null;

alter table public.horodateur_shifts
  add column if not exists organization_id uuid null,
  add column if not exists organization_company_id uuid null;

alter table public.horodateur_current_state
  add column if not exists organization_id uuid null,
  add column if not exists organization_company_id uuid null;

alter table public.horodateur_exceptions
  add column if not exists organization_id uuid null,
  add column if not exists organization_company_id uuid null;

alter table public.horodateur_punch_zones
  add column if not exists organization_id uuid null,
  add column if not exists organization_company_id uuid null;

-- 3. Preserve existing tenant ownership and backfill only missing canonical keys.
-- A legacy Oliem fallback is used only for rows with no organization_id. Company
-- keys are always resolved inside the row's organization_id.
do $$
declare
  v_legacy_oliem_organization_id uuid;
begin
  select o.id
    into v_legacy_oliem_organization_id
  from public.organizations o
  where o.slug = 'oliem-solution'
    and o.deleted_at is null;

  if v_legacy_oliem_organization_id is null then
    raise exception 'Phase4D tenant backfill blocked: organization oliem-solution is missing';
  end if;

  update public.chauffeurs c
  set organization_id = v_legacy_oliem_organization_id
  where c.organization_id is null
    and c.primary_company in (
      'oliem_solutions',
      'titan_produits_industriels'
    );

  update public.chauffeurs c
  set organization_company_id = oc.id
  from public.organization_companies oc
  where c.organization_company_id is null
    and oc.organization_id = c.organization_id
    and oc.company_code = c.primary_company;

  update public.gps_bases b
  set organization_id = v_legacy_oliem_organization_id
  where b.organization_id is null
    and b.company_context in (
      'oliem_solutions',
      'titan_produits_industriels'
    );

  update public.gps_bases b
  set organization_company_id = oc.id
  from public.organization_companies oc
  where b.organization_company_id is null
    and oc.organization_id = b.organization_id
    and oc.company_code = b.company_context;

  update public.horodateur_events e
  set organization_id = c.organization_id
  from public.chauffeurs c
  where c.id = e.employee_id
    and e.organization_id is null;

  update public.horodateur_events e
  set organization_company_id = oc.id
  from public.chauffeurs c, public.organization_companies oc
  where c.id = e.employee_id
    and e.organization_company_id is null
    and oc.organization_id = e.organization_id
    and oc.organization_id = c.organization_id
    and oc.company_code = coalesce(e.company_context, c.primary_company);

  update public.horodateur_shifts s
  set organization_id = c.organization_id
  from public.chauffeurs c
  where c.id = s.employee_id
    and s.organization_id is null;

  update public.horodateur_shifts s
  set organization_company_id = oc.id
  from public.chauffeurs c, public.organization_companies oc
  where c.id = s.employee_id
    and s.organization_company_id is null
    and oc.organization_id = s.organization_id
    and oc.organization_id = c.organization_id
    and oc.company_code = coalesce(s.company_context, c.primary_company);

  update public.horodateur_current_state st
  set organization_id = c.organization_id
  from public.chauffeurs c
  where c.id = st.employee_id
    and st.organization_id is null;

  update public.horodateur_current_state st
  set organization_company_id = oc.id
  from public.chauffeurs c, public.organization_companies oc
  where c.id = st.employee_id
    and st.organization_company_id is null
    and oc.organization_id = st.organization_id
    and oc.organization_id = c.organization_id
    and oc.company_code = coalesce(st.company_context, c.primary_company);

  update public.horodateur_exceptions x
  set organization_id = c.organization_id
  from public.chauffeurs c
  where c.id = x.employee_id
    and x.organization_id is null;

  update public.horodateur_exceptions x
  set organization_company_id = oc.id
  from public.chauffeurs c, public.organization_companies oc
  where c.id = x.employee_id
    and x.organization_company_id is null
    and oc.id = c.organization_company_id
    and oc.organization_id = x.organization_id
    and oc.organization_id = c.organization_id;

  update public.horodateur_punch_zones z
  set organization_id = v_legacy_oliem_organization_id
  where z.organization_id is null
    and z.company_key in (
      'all',
      'oliem_solutions',
      'titan_produits_industriels'
    );

  update public.horodateur_punch_zones z
  set organization_company_id = oc.id
  from public.organization_companies oc
  where z.company_key <> 'all'
    and z.organization_company_id is null
    and oc.organization_id = z.organization_id
    and oc.company_code = z.company_key;
end;
$$;

-- 4. Fail before constraints if any row is unresolved or internally inconsistent.
do $$
declare
  v_table text;
  v_unresolved bigint;
begin
  foreach v_table in array array[
    'chauffeurs',
    'gps_bases',
    'horodateur_events',
    'horodateur_shifts',
    'horodateur_current_state',
    'horodateur_exceptions'
  ]
  loop
    execute format(
      'select count(*) from public.%I where organization_id is null or organization_company_id is null',
      v_table
    ) into v_unresolved;
    if v_unresolved > 0 then
      raise exception 'Phase4D tenant backfill blocked: %.% unresolved row(s)', v_table, v_unresolved;
    end if;
  end loop;

  select count(*) into v_unresolved
  from public.horodateur_punch_zones
  where organization_id is null
     or (company_key <> 'all' and organization_company_id is null)
     or (company_key = 'all' and organization_company_id is not null);
  if v_unresolved > 0 then
    raise exception 'Phase4D tenant backfill blocked: horodateur_punch_zones.% unresolved row(s)', v_unresolved;
  end if;

  foreach v_table in array array[
    'chauffeurs',
    'gps_bases',
    'horodateur_events',
    'horodateur_shifts',
    'horodateur_current_state',
    'horodateur_exceptions',
    'horodateur_punch_zones'
  ]
  loop
    execute format(
      'select count(*) from public.%I t join public.organization_companies c on c.id = t.organization_company_id where c.organization_id <> t.organization_id',
      v_table
    ) into v_unresolved;
    if v_unresolved > 0 then
      raise exception 'Phase4D tenant backfill blocked: %.% org/company mismatch(es)', v_table, v_unresolved;
    end if;
  end loop;

  foreach v_table in array array[
    'horodateur_events',
    'horodateur_shifts',
    'horodateur_current_state',
    'horodateur_exceptions'
  ]
  loop
    execute format(
      'select count(*) from public.%I t join public.chauffeurs c on c.id = t.employee_id where t.organization_id <> c.organization_id',
      v_table
    ) into v_unresolved;
    if v_unresolved > 0 then
      raise exception
        'Phase4D tenant backfill blocked: %.% employee tenant mismatch(es)',
        v_table,
        v_unresolved;
    end if;
  end loop;
end;
$$;

-- 5. Tenant and company FKs. Existing constraints are accepted only when their
-- structural definition matches; a same-name incompatible constraint fails closed.
do $$
declare
  r record;
  v_constraint record;
  v_local_columns text[];
  v_referenced_columns text[];
begin
  for r in
    select *
    from (
      values
        ('chauffeurs', 'chauffeurs_organization_id_fkey', array['organization_id']::text[], 'organizations', array['id']::text[]),
        ('chauffeurs', 'chauffeurs_organization_company_id_fkey', array['organization_company_id']::text[], 'organization_companies', array['id']::text[]),
        ('chauffeurs', 'chauffeurs_org_company_consistency_fkey', array['organization_company_id', 'organization_id']::text[], 'organization_companies', array['id', 'organization_id']::text[]),
        ('gps_bases', 'gps_bases_organization_id_fkey', array['organization_id']::text[], 'organizations', array['id']::text[]),
        ('gps_bases', 'gps_bases_organization_company_id_fkey', array['organization_company_id']::text[], 'organization_companies', array['id']::text[]),
        ('gps_bases', 'gps_bases_org_company_consistency_fkey', array['organization_company_id', 'organization_id']::text[], 'organization_companies', array['id', 'organization_id']::text[]),
        ('horodateur_events', 'horodateur_events_organization_id_fkey', array['organization_id']::text[], 'organizations', array['id']::text[]),
        ('horodateur_events', 'horodateur_events_organization_company_id_fkey', array['organization_company_id']::text[], 'organization_companies', array['id']::text[]),
        ('horodateur_events', 'horodateur_events_org_company_consistency_fkey', array['organization_company_id', 'organization_id']::text[], 'organization_companies', array['id', 'organization_id']::text[]),
        ('horodateur_shifts', 'horodateur_shifts_organization_id_fkey', array['organization_id']::text[], 'organizations', array['id']::text[]),
        ('horodateur_shifts', 'horodateur_shifts_organization_company_id_fkey', array['organization_company_id']::text[], 'organization_companies', array['id']::text[]),
        ('horodateur_shifts', 'horodateur_shifts_org_company_consistency_fkey', array['organization_company_id', 'organization_id']::text[], 'organization_companies', array['id', 'organization_id']::text[]),
        ('horodateur_current_state', 'horodateur_current_state_organization_id_fkey', array['organization_id']::text[], 'organizations', array['id']::text[]),
        ('horodateur_current_state', 'horodateur_current_state_organization_company_id_fkey', array['organization_company_id']::text[], 'organization_companies', array['id']::text[]),
        ('horodateur_current_state', 'horodateur_current_state_org_company_consistency_fkey', array['organization_company_id', 'organization_id']::text[], 'organization_companies', array['id', 'organization_id']::text[]),
        ('horodateur_exceptions', 'horodateur_exceptions_organization_id_fkey', array['organization_id']::text[], 'organizations', array['id']::text[]),
        ('horodateur_exceptions', 'horodateur_exceptions_organization_company_id_fkey', array['organization_company_id']::text[], 'organization_companies', array['id']::text[]),
        ('horodateur_exceptions', 'horodateur_exceptions_org_company_consistency_fkey', array['organization_company_id', 'organization_id']::text[], 'organization_companies', array['id', 'organization_id']::text[]),
        ('horodateur_punch_zones', 'horodateur_punch_zones_organization_id_fkey', array['organization_id']::text[], 'organizations', array['id']::text[]),
        ('horodateur_punch_zones', 'horodateur_punch_zones_organization_company_id_fkey', array['organization_company_id']::text[], 'organization_companies', array['id']::text[]),
        ('horodateur_punch_zones', 'horodateur_punch_zones_org_company_consistency_fkey', array['organization_company_id', 'organization_id']::text[], 'organization_companies', array['id', 'organization_id']::text[])
    ) as expected(table_name, constraint_name, local_columns, referenced_table, referenced_columns)
  loop
    select
      con.oid,
      con.contype,
      con.confrelid,
      con.confdeltype,
      con.confupdtype,
      con.confmatchtype,
      con.condeferrable,
      con.condeferred,
      con.convalidated
      into v_constraint
    from pg_constraint con
    where con.conrelid = format('public.%I', r.table_name)::regclass
      and con.conname = r.constraint_name;

    if not found then
      execute format(
        'alter table public.%I add constraint %I foreign key (%s) references public.%I (%s) on delete restrict',
        r.table_name,
        r.constraint_name,
        array_to_string(r.local_columns, ', '),
        r.referenced_table,
        array_to_string(r.referenced_columns, ', ')
      );
      continue;
    end if;

    select array_agg(att.attname::text order by key_position.ordinality)
      into v_local_columns
    from pg_constraint con
    cross join lateral unnest(con.conkey) with ordinality as key_position(attnum, ordinality)
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = key_position.attnum
    where con.oid = v_constraint.oid;

    select array_agg(att.attname::text order by key_position.ordinality)
      into v_referenced_columns
    from pg_constraint con
    cross join lateral unnest(con.confkey) with ordinality as key_position(attnum, ordinality)
    join pg_attribute att
      on att.attrelid = con.confrelid
     and att.attnum = key_position.attnum
    where con.oid = v_constraint.oid;

    if v_constraint.contype <> 'f'
       or v_constraint.confrelid <> format('public.%I', r.referenced_table)::regclass
       or v_constraint.confdeltype <> 'r'
       or v_constraint.confupdtype <> 'a'
       or v_constraint.confmatchtype <> 's'
       or v_constraint.condeferrable
       or v_constraint.condeferred
       or not v_constraint.convalidated
       or v_local_columns is distinct from r.local_columns
       or v_referenced_columns is distinct from r.referenced_columns then
      raise exception
        'Phase4D FK validation blocked: %.% exists with an incompatible definition',
        r.table_name,
        r.constraint_name;
    end if;
  end loop;
end;
$$;

-- 6. The tenant is always required. Only a punch zone may target every company.
alter table public.chauffeurs
  alter column organization_id set not null,
  alter column organization_company_id set not null;
alter table public.gps_bases
  alter column organization_id set not null,
  alter column organization_company_id set not null;
alter table public.horodateur_events
  alter column organization_id set not null,
  alter column organization_company_id set not null;
alter table public.horodateur_shifts
  alter column organization_id set not null,
  alter column organization_company_id set not null;
alter table public.horodateur_current_state
  alter column organization_id set not null,
  alter column organization_company_id set not null;
alter table public.horodateur_exceptions
  alter column organization_id set not null,
  alter column organization_company_id set not null;
alter table public.horodateur_punch_zones
  alter column organization_id set not null;

-- 7. Tenant-first indexes used by API filters and RLS.
create index if not exists idx_chauffeurs_organization_id
  on public.chauffeurs (organization_id);
create index if not exists idx_chauffeurs_org_company
  on public.chauffeurs (organization_id, organization_company_id);
create index if not exists idx_gps_bases_org_company
  on public.gps_bases (organization_id, organization_company_id, type_base, nom);
create index if not exists idx_horodateur_events_organization_occurred
  on public.horodateur_events (organization_id, occurred_at desc);
create index if not exists idx_horodateur_events_org_company
  on public.horodateur_events (organization_id, organization_company_id);
create index if not exists idx_horodateur_shifts_organization_week
  on public.horodateur_shifts (organization_id, week_start_date desc);
create index if not exists idx_horodateur_current_state_organization
  on public.horodateur_current_state (organization_id);
create index if not exists idx_horodateur_exceptions_organization_status
  on public.horodateur_exceptions (organization_id, status, requested_at asc);
create index if not exists idx_horodateur_punch_zones_organization_active
  on public.horodateur_punch_zones (organization_id, active, zone_key);

-- 8. Legacy values are generic projections, not closed tenant boundaries.
do $$
declare
  r record;
begin
  for r in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and con.contype = 'c'
      and rel.relname in (
        'chauffeurs',
        'gps_bases',
        'horodateur_events',
        'horodateur_shifts',
        'horodateur_current_state',
        'horodateur_punch_zones'
      )
      and pg_get_constraintdef(con.oid) ilike '%oliem_solutions%'
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.relname, r.conname);
  end loop;
end;
$$;

alter table public.chauffeurs
  add constraint chauffeurs_primary_company_format_check
  check (primary_company ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$');

alter table public.gps_bases
  add constraint gps_bases_company_context_format_check
  check (company_context ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$');

alter table public.horodateur_events
  add constraint horodateur_events_company_context_format_check
    check (company_context is null or company_context ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  add constraint horodateur_events_work_company_key_format_check
    check (work_company_key is null or work_company_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  add constraint horodateur_events_employer_company_key_format_check
    check (employer_company_key is null or employer_company_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$');

alter table public.horodateur_shifts
  add constraint horodateur_shifts_company_context_format_check
  check (company_context ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$');

alter table public.horodateur_current_state
  add constraint horodateur_current_state_company_context_format_check
  check (company_context is null or company_context ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$');

alter table public.horodateur_punch_zones
  add constraint horodateur_punch_zones_company_key_format_check
  check (
    company_key = 'all'
    or company_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
  ),
  add constraint horodateur_punch_zones_all_company_consistency_check
  check (
    (company_key = 'all' and organization_company_id is null)
    or (company_key <> 'all' and organization_company_id is not null)
  );

-- 9. Reuse the canonical helper restored by the historical hardening migration.
do $$
begin
  if to_regprocedure('public.current_user_can_access_organization(uuid)') is null then
    raise exception
      'Phase4D RLS blocked: canonical helper public.current_user_can_access_organization(uuid) is missing';
  end if;
end;
$$;

-- 10. Tenant-scoped RLS. Backend service-role writes remain server-only.
drop policy if exists "chauffeurs_admin_select" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_insert" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_update" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_delete" on public.chauffeurs;
drop policy if exists "chauffeurs_direction_operational_select" on public.chauffeurs;
drop policy if exists "chauffeurs_employee_self_select" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_select_tenant" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_insert_tenant" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_update_tenant" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_delete_tenant" on public.chauffeurs;
drop policy if exists "chauffeurs_direction_select_tenant" on public.chauffeurs;
drop policy if exists "chauffeurs_employee_select" on public.chauffeurs;

create policy "chauffeurs_employee_self_select" on public.chauffeurs
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    and public.current_user_can_access_organization(organization_id)
  );
create policy "chauffeurs_direction_operational_select" on public.chauffeurs
  for select to authenticated
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
create policy "chauffeurs_admin_select" on public.chauffeurs
  for select to authenticated
  using (
    public.is_admin_user()
    and public.current_user_can_access_organization(organization_id)
  );
create policy "chauffeurs_admin_insert" on public.chauffeurs
  for insert to authenticated
  with check (
    public.is_admin_user()
    and public.current_user_can_access_organization(organization_id)
  );
create policy "chauffeurs_admin_update" on public.chauffeurs
  for update to authenticated
  using (
    public.is_admin_user()
    and public.current_user_can_access_organization(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.current_user_can_access_organization(organization_id)
  );
create policy "chauffeurs_admin_delete" on public.chauffeurs
  for delete to authenticated
  using (
    public.is_admin_user()
    and public.current_user_can_access_organization(organization_id)
  );

drop policy if exists "gps_bases_select_policy" on public.gps_bases;
drop policy if exists "gps_bases_insert_policy" on public.gps_bases;
drop policy if exists "gps_bases_update_policy" on public.gps_bases;
drop policy if exists "gps_bases_delete_policy" on public.gps_bases;
create policy "gps_bases_select_policy" on public.gps_bases
  for select to authenticated
  using (
    public.is_direction_user()
    and (public.has_app_permission('ressources') or public.has_app_permission('terrain'))
    and public.current_user_can_access_organization(organization_id)
  );
create policy "gps_bases_insert_policy" on public.gps_bases
  for insert to authenticated
  with check (
    public.is_direction_user()
    and (public.has_app_permission('ressources') or public.has_app_permission('terrain'))
    and public.current_user_can_access_organization(organization_id)
  );
create policy "gps_bases_update_policy" on public.gps_bases
  for update to authenticated
  using (
    public.is_direction_user()
    and (public.has_app_permission('ressources') or public.has_app_permission('terrain'))
    and public.current_user_can_access_organization(organization_id)
  )
  with check (
    public.is_direction_user()
    and (public.has_app_permission('ressources') or public.has_app_permission('terrain'))
    and public.current_user_can_access_organization(organization_id)
  );
create policy "gps_bases_delete_policy" on public.gps_bases
  for delete to authenticated
  using (
    public.is_direction_user()
    and (public.has_app_permission('ressources') or public.has_app_permission('terrain'))
    and public.current_user_can_access_organization(organization_id)
  );

drop policy if exists "horodateur_events_select_phase1" on public.horodateur_events;
create policy "horodateur_events_select_phase1" on public.horodateur_events
  for select to authenticated
  using (
    (
      exists (
        select 1 from public.chauffeurs c
        where c.id = horodateur_events.employee_id
          and c.auth_user_id = (select auth.uid())
          and c.organization_id = horodateur_events.organization_id
      )
      and public.current_user_can_access_organization(organization_id)
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
      and public.current_user_can_access_organization(organization_id)
    )
  );

drop policy if exists "horodateur_shifts_select_phase1" on public.horodateur_shifts;
create policy "horodateur_shifts_select_phase1" on public.horodateur_shifts
  for select to authenticated
  using (
    (
      exists (
        select 1 from public.chauffeurs c
        where c.id = horodateur_shifts.employee_id
          and c.auth_user_id = (select auth.uid())
          and c.organization_id = horodateur_shifts.organization_id
      )
      and public.current_user_can_access_organization(organization_id)
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
      and public.current_user_can_access_organization(organization_id)
    )
  );

drop policy if exists "horodateur_current_state_select_phase1" on public.horodateur_current_state;
create policy "horodateur_current_state_select_phase1" on public.horodateur_current_state
  for select to authenticated
  using (
    (
      exists (
        select 1 from public.chauffeurs c
        where c.id = horodateur_current_state.employee_id
          and c.auth_user_id = (select auth.uid())
          and c.organization_id = horodateur_current_state.organization_id
      )
      and public.current_user_can_access_organization(organization_id)
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
      and public.current_user_can_access_organization(organization_id)
    )
  );

drop policy if exists "horodateur_exceptions_select_phase1" on public.horodateur_exceptions;
create policy "horodateur_exceptions_select_phase1" on public.horodateur_exceptions
  for select to authenticated
  using (
    (
      exists (
        select 1 from public.chauffeurs c
        where c.id = horodateur_exceptions.employee_id
          and c.auth_user_id = (select auth.uid())
          and c.organization_id = horodateur_exceptions.organization_id
      )
      and public.current_user_can_access_organization(organization_id)
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
      and public.current_user_can_access_organization(organization_id)
    )
  );

-- Punch zones stay service-role only; API routes must enforce organization_id.
drop policy if exists "horodateur_punch_zones_no_direct" on public.horodateur_punch_zones;
create policy "horodateur_punch_zones_no_direct" on public.horodateur_punch_zones
  for all to authenticated
  using (false)
  with check (false);

commit;
