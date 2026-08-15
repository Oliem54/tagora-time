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

-- 3. Backfill only the existing Oliem organization and its operating companies.
do $$
declare
  v_organization_id uuid;
  v_oliem_company_id uuid;
  v_titan_company_id uuid;
begin
  select o.id
    into v_organization_id
  from public.organizations o
  where o.slug = 'oliem-solution'
    and o.deleted_at is null;

  if v_organization_id is null then
    raise exception 'Phase4D tenant backfill blocked: organization oliem-solution is missing';
  end if;

  select c.id
    into v_oliem_company_id
  from public.organization_companies c
  where c.organization_id = v_organization_id
    and c.company_code = 'oliem_solutions';

  select c.id
    into v_titan_company_id
  from public.organization_companies c
  where c.organization_id = v_organization_id
    and c.company_code = 'titan_produits_industriels';

  if v_oliem_company_id is null or v_titan_company_id is null then
    raise exception 'Phase4D tenant backfill blocked: Oliem/Titan company mapping is incomplete';
  end if;

  if exists (
    select 1 from public.chauffeurs c
    where c.primary_company is null
       or c.primary_company not in ('oliem_solutions', 'titan_produits_industriels')
  ) then
    raise exception 'Phase4D tenant backfill blocked: chauffeurs contains an unknown primary_company';
  end if;

  update public.chauffeurs c
  set organization_id = v_organization_id,
      organization_company_id = case c.primary_company
        when 'oliem_solutions' then v_oliem_company_id
        when 'titan_produits_industriels' then v_titan_company_id
      end
  where c.organization_id is null
     or c.organization_company_id is null;

  if exists (
    select 1 from public.gps_bases b
    where b.company_context not in ('oliem_solutions', 'titan_produits_industriels')
  ) then
    raise exception 'Phase4D tenant backfill blocked: gps_bases contains an unknown company_context';
  end if;

  update public.gps_bases b
  set organization_id = v_organization_id,
      organization_company_id = case b.company_context
        when 'oliem_solutions' then v_oliem_company_id
        when 'titan_produits_industriels' then v_titan_company_id
      end
  where b.organization_id is null
     or b.organization_company_id is null;

  if exists (
    select 1 from public.horodateur_events e
    left join public.chauffeurs c on c.id = e.employee_id
    where coalesce(e.company_context, c.primary_company) is null
       or coalesce(e.company_context, c.primary_company)
          not in ('oliem_solutions', 'titan_produits_industriels')
  ) then
    raise exception 'Phase4D tenant backfill blocked: horodateur_events contains an unknown company mapping';
  end if;

  update public.horodateur_events e
  set organization_id = c.organization_id,
      organization_company_id = case coalesce(e.company_context, c.primary_company)
        when 'oliem_solutions' then v_oliem_company_id
        when 'titan_produits_industriels' then v_titan_company_id
      end
  from public.chauffeurs c
  where c.id = e.employee_id
    and (e.organization_id is null or e.organization_company_id is null);

  if exists (
    select 1 from public.horodateur_shifts s
    left join public.chauffeurs c on c.id = s.employee_id
    where coalesce(s.company_context, c.primary_company) is null
       or coalesce(s.company_context, c.primary_company)
          not in ('oliem_solutions', 'titan_produits_industriels')
  ) then
    raise exception 'Phase4D tenant backfill blocked: horodateur_shifts contains an unknown company mapping';
  end if;

  update public.horodateur_shifts s
  set organization_id = c.organization_id,
      organization_company_id = case coalesce(s.company_context, c.primary_company)
        when 'oliem_solutions' then v_oliem_company_id
        when 'titan_produits_industriels' then v_titan_company_id
      end
  from public.chauffeurs c
  where c.id = s.employee_id
    and (s.organization_id is null or s.organization_company_id is null);

  update public.horodateur_current_state st
  set organization_id = c.organization_id,
      organization_company_id = case coalesce(st.company_context, c.primary_company)
        when 'oliem_solutions' then v_oliem_company_id
        when 'titan_produits_industriels' then v_titan_company_id
      end
  from public.chauffeurs c
  where c.id = st.employee_id
    and coalesce(st.company_context, c.primary_company)
        in ('oliem_solutions', 'titan_produits_industriels')
    and (st.organization_id is null or st.organization_company_id is null);

  update public.horodateur_exceptions x
  set organization_id = c.organization_id,
      organization_company_id = c.organization_company_id
  from public.chauffeurs c
  where c.id = x.employee_id
    and (x.organization_id is null or x.organization_company_id is null);

  if exists (
    select 1 from public.horodateur_punch_zones z
    where z.company_key not in (
      'all',
      'oliem_solutions',
      'titan_produits_industriels'
    )
  ) then
    raise exception 'Phase4D tenant backfill blocked: punch zones contains an unknown company_key';
  end if;

  update public.horodateur_punch_zones z
  set organization_id = v_organization_id,
      organization_company_id = case z.company_key
        when 'all' then null
        when 'oliem_solutions' then v_oliem_company_id
        when 'titan_produits_industriels' then v_titan_company_id
      end
  where z.organization_id is null
     or (z.company_key <> 'all' and z.organization_company_id is null);
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
end;
$$;

-- 5. Tenant and company FKs. Composite FKs enforce company ownership.
alter table public.chauffeurs
  add constraint chauffeurs_organization_id_fkey foreign key (organization_id)
    references public.organizations (id) on delete restrict,
  add constraint chauffeurs_organization_company_id_fkey foreign key (organization_company_id)
    references public.organization_companies (id) on delete restrict,
  add constraint chauffeurs_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id) on delete restrict;

alter table public.gps_bases
  add constraint gps_bases_organization_id_fkey foreign key (organization_id)
    references public.organizations (id) on delete restrict,
  add constraint gps_bases_organization_company_id_fkey foreign key (organization_company_id)
    references public.organization_companies (id) on delete restrict,
  add constraint gps_bases_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id) on delete restrict;

alter table public.horodateur_events
  add constraint horodateur_events_organization_id_fkey foreign key (organization_id)
    references public.organizations (id) on delete restrict,
  add constraint horodateur_events_organization_company_id_fkey foreign key (organization_company_id)
    references public.organization_companies (id) on delete restrict,
  add constraint horodateur_events_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id) on delete restrict;

alter table public.horodateur_shifts
  add constraint horodateur_shifts_organization_id_fkey foreign key (organization_id)
    references public.organizations (id) on delete restrict,
  add constraint horodateur_shifts_organization_company_id_fkey foreign key (organization_company_id)
    references public.organization_companies (id) on delete restrict,
  add constraint horodateur_shifts_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id) on delete restrict;

alter table public.horodateur_current_state
  add constraint horodateur_current_state_organization_id_fkey foreign key (organization_id)
    references public.organizations (id) on delete restrict,
  add constraint horodateur_current_state_organization_company_id_fkey foreign key (organization_company_id)
    references public.organization_companies (id) on delete restrict,
  add constraint horodateur_current_state_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id) on delete restrict;

alter table public.horodateur_exceptions
  add constraint horodateur_exceptions_organization_id_fkey foreign key (organization_id)
    references public.organizations (id) on delete restrict,
  add constraint horodateur_exceptions_organization_company_id_fkey foreign key (organization_company_id)
    references public.organization_companies (id) on delete restrict,
  add constraint horodateur_exceptions_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id) on delete restrict;

alter table public.horodateur_punch_zones
  add constraint horodateur_punch_zones_organization_id_fkey foreign key (organization_id)
    references public.organizations (id) on delete restrict,
  add constraint horodateur_punch_zones_organization_company_id_fkey foreign key (organization_company_id)
    references public.organization_companies (id) on delete restrict,
  add constraint horodateur_punch_zones_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id) on delete restrict;

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

-- 9. Memberships are FORCE RLS/service-only, so policies need a hardened bridge.
create or replace function public.has_active_organization_membership(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and o.status = 'active'
      and o.deleted_at is null
  );
$$;

revoke all on function public.has_active_organization_membership(uuid) from public;
revoke all on function public.has_active_organization_membership(uuid) from anon;
revoke all on function public.has_active_organization_membership(uuid) from authenticated;
grant execute on function public.has_active_organization_membership(uuid) to authenticated;

-- 10. Tenant-scoped RLS. Backend service-role writes remain server-only.
drop policy if exists "chauffeurs_admin_select" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_insert" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_update" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_delete" on public.chauffeurs;
drop policy if exists "chauffeurs_direction_operational_select" on public.chauffeurs;
drop policy if exists "chauffeurs_employee_self_select" on public.chauffeurs;

create policy "chauffeurs_employee_self_select" on public.chauffeurs
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    and public.has_active_organization_membership(organization_id)
  );
create policy "chauffeurs_direction_operational_select" on public.chauffeurs
  for select to authenticated
  using (
    public.is_direction_user()
    and (
      public.has_app_permission('ressources')
      or public.has_app_permission('livraisons')
      or public.has_app_permission('terrain')
    )
    and public.has_active_organization_membership(organization_id)
  );
create policy "chauffeurs_admin_select" on public.chauffeurs
  for select to authenticated
  using (
    public.is_admin_user()
    and public.has_active_organization_membership(organization_id)
  );
create policy "chauffeurs_admin_insert" on public.chauffeurs
  for insert to authenticated
  with check (
    public.is_admin_user()
    and public.has_active_organization_membership(organization_id)
  );
create policy "chauffeurs_admin_update" on public.chauffeurs
  for update to authenticated
  using (
    public.is_admin_user()
    and public.has_active_organization_membership(organization_id)
  )
  with check (
    public.is_admin_user()
    and public.has_active_organization_membership(organization_id)
  );
create policy "chauffeurs_admin_delete" on public.chauffeurs
  for delete to authenticated
  using (
    public.is_admin_user()
    and public.has_active_organization_membership(organization_id)
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
    and public.has_active_organization_membership(organization_id)
  );
create policy "gps_bases_insert_policy" on public.gps_bases
  for insert to authenticated
  with check (
    public.is_direction_user()
    and (public.has_app_permission('ressources') or public.has_app_permission('terrain'))
    and public.has_active_organization_membership(organization_id)
  );
create policy "gps_bases_update_policy" on public.gps_bases
  for update to authenticated
  using (
    public.is_direction_user()
    and (public.has_app_permission('ressources') or public.has_app_permission('terrain'))
    and public.has_active_organization_membership(organization_id)
  )
  with check (
    public.is_direction_user()
    and (public.has_app_permission('ressources') or public.has_app_permission('terrain'))
    and public.has_active_organization_membership(organization_id)
  );
create policy "gps_bases_delete_policy" on public.gps_bases
  for delete to authenticated
  using (
    public.is_direction_user()
    and (public.has_app_permission('ressources') or public.has_app_permission('terrain'))
    and public.has_active_organization_membership(organization_id)
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
      and public.has_active_organization_membership(organization_id)
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
      and public.has_active_organization_membership(organization_id)
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
      and public.has_active_organization_membership(organization_id)
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
      and public.has_active_organization_membership(organization_id)
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
      and public.has_active_organization_membership(organization_id)
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
      and public.has_active_organization_membership(organization_id)
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
      and public.has_active_organization_membership(organization_id)
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
      and public.has_active_organization_membership(organization_id)
    )
  );

-- Punch zones stay service-role only; API routes must enforce organization_id.
drop policy if exists "horodateur_punch_zones_no_direct" on public.horodateur_punch_zones;
create policy "horodateur_punch_zones_no_direct" on public.horodateur_punch_zones
  for all to authenticated
  using (false)
  with check (false);

comment on function public.has_active_organization_membership(uuid) is
  'Phase4D: fail-closed active tenant membership check for operational RLS.';

commit;
