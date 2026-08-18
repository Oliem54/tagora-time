-- Phase 4D Lot 2 — replace leftover closed company-list CHECKs.
-- PostgreSQL stores `IN (...)` as `= ANY (ARRAY[...])`. Migration
-- 20260815140000 only matched `\yIN\s*\(` and left those checks in place.
-- This file drops the leftover enums, keeps generic format CHECKs, and adds a
-- declarative composite FK to organization_companies
-- (id, organization_id, company_code).
--
-- Staging may still have a live legacy column gps_bases.compagnie that Git
-- schema rebuilds do not create. Handle that column only when it already
-- exists. Never create, drop, rename, or change nullability of that column,
-- and never rewrite its rows.
--
-- No data rewrite, no UPDATE, no DELETE, no cascading drops, no trigger.

begin;

-- 1. Fail closed if the Phase 4D tenant keys are missing.
do $$
begin
  if to_regclass('public.organization_companies_id_organization_uidx') is null then
    raise exception
      'Phase4D closed-list replacement blocked: organization_companies_id_organization_uidx is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'gps_bases_org_company_consistency_fkey'
      and conrelid = 'public.gps_bases'::regclass
  ) then
    raise exception
      'Phase4D closed-list replacement blocked: gps_bases_org_company_consistency_fkey is missing';
  end if;
end;
$$;

-- 2. Unique target required by the 3-column company-code FK.
create unique index if not exists organization_companies_id_organization_code_uidx
  on public.organization_companies (id, organization_id, company_code);

-- 3. Drop leftover closed-list CHECKs (IN (...) or = ANY (ARRAY[...])).
-- Never drop regex format checks or the punch-zone all-company consistency check.
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
      and pg_get_constraintdef(con.oid)
        ~* '(primary_company|company_context|company_key|work_company_key|employer_company_key)'
      and pg_get_constraintdef(con.oid) !~* 'organization_company_id'
      and pg_get_constraintdef(con.oid) !~* '~'
      and (
        pg_get_constraintdef(con.oid) ~* '\yIN\s*\('
        or pg_get_constraintdef(con.oid) ~* '=\s*ANY\s*\(\s*ARRAY\['
      )
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.relname, r.conname);
  end loop;
end;
$$;

-- 4. Keep / restore generic format CHECKs without enumerating tenants.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chauffeurs_primary_company_format_check'
      and conrelid = 'public.chauffeurs'::regclass
  ) then
    alter table public.chauffeurs
      add constraint chauffeurs_primary_company_format_check
      check (primary_company ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'gps_bases_company_context_format_check'
      and conrelid = 'public.gps_bases'::regclass
  ) then
    alter table public.gps_bases
      add constraint gps_bases_company_context_format_check
      check (company_context ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'horodateur_events_company_context_format_check'
      and conrelid = 'public.horodateur_events'::regclass
  ) then
    alter table public.horodateur_events
      add constraint horodateur_events_company_context_format_check
      check (
        company_context is null
        or company_context ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'horodateur_events_work_company_key_format_check'
      and conrelid = 'public.horodateur_events'::regclass
  ) then
    alter table public.horodateur_events
      add constraint horodateur_events_work_company_key_format_check
      check (
        work_company_key is null
        or work_company_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'horodateur_events_employer_company_key_format_check'
      and conrelid = 'public.horodateur_events'::regclass
  ) then
    alter table public.horodateur_events
      add constraint horodateur_events_employer_company_key_format_check
      check (
        employer_company_key is null
        or employer_company_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'horodateur_shifts_company_context_format_check'
      and conrelid = 'public.horodateur_shifts'::regclass
  ) then
    alter table public.horodateur_shifts
      add constraint horodateur_shifts_company_context_format_check
      check (company_context ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'horodateur_current_state_company_context_format_check'
      and conrelid = 'public.horodateur_current_state'::regclass
  ) then
    alter table public.horodateur_current_state
      add constraint horodateur_current_state_company_context_format_check
      check (
        company_context is null
        or company_context ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'horodateur_punch_zones_company_key_format_check'
      and conrelid = 'public.horodateur_punch_zones'::regclass
  ) then
    alter table public.horodateur_punch_zones
      add constraint horodateur_punch_zones_company_key_format_check
      check (
        company_key = 'all'
        or company_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'horodateur_punch_zones_all_company_consistency_check'
      and conrelid = 'public.horodateur_punch_zones'::regclass
  ) then
    alter table public.horodateur_punch_zones
      add constraint horodateur_punch_zones_all_company_consistency_check
      check (
        (company_key = 'all' and organization_company_id is null)
        or (company_key <> 'all' and organization_company_id is not null)
      );
  end if;
end;
$$;

-- 5. Fail closed on historical projection mismatches. Never rewrite rows.
do $$
declare
  v_mismatch bigint;
begin
  select count(*) into v_mismatch
  from public.chauffeurs c
  join public.organization_companies oc on oc.id = c.organization_company_id
  where oc.organization_id is distinct from c.organization_id
     or oc.company_code is distinct from c.primary_company;
  if v_mismatch > 0 then
    raise exception
      'Phase4D closed-list replacement blocked: chauffeurs.% company-code mismatch(es)',
      v_mismatch;
  end if;

  select count(*) into v_mismatch
  from public.gps_bases b
  join public.organization_companies oc on oc.id = b.organization_company_id
  where oc.organization_id is distinct from b.organization_id
     or oc.company_code is distinct from b.company_context;
  if v_mismatch > 0 then
    raise exception
      'Phase4D closed-list replacement blocked: gps_bases.% company-code mismatch(es)',
      v_mismatch;
  end if;

  select count(*) into v_mismatch
  from public.horodateur_events e
  join public.organization_companies oc on oc.id = e.organization_company_id
  where e.company_context is not null
    and (
      oc.organization_id is distinct from e.organization_id
      or oc.company_code is distinct from e.company_context
    );
  if v_mismatch > 0 then
    raise exception
      'Phase4D closed-list replacement blocked: horodateur_events.% company-code mismatch(es)',
      v_mismatch;
  end if;

  select count(*) into v_mismatch
  from public.horodateur_shifts s
  join public.organization_companies oc on oc.id = s.organization_company_id
  where oc.organization_id is distinct from s.organization_id
     or oc.company_code is distinct from s.company_context;
  if v_mismatch > 0 then
    raise exception
      'Phase4D closed-list replacement blocked: horodateur_shifts.% company-code mismatch(es)',
      v_mismatch;
  end if;

  select count(*) into v_mismatch
  from public.horodateur_current_state st
  join public.organization_companies oc on oc.id = st.organization_company_id
  where st.company_context is not null
    and (
      oc.organization_id is distinct from st.organization_id
      or oc.company_code is distinct from st.company_context
    );
  if v_mismatch > 0 then
    raise exception
      'Phase4D closed-list replacement blocked: horodateur_current_state.% company-code mismatch(es)',
      v_mismatch;
  end if;

  select count(*) into v_mismatch
  from public.horodateur_punch_zones z
  join public.organization_companies oc on oc.id = z.organization_company_id
  where z.company_key <> 'all'
    and (
      oc.organization_id is distinct from z.organization_id
      or oc.company_code is distinct from z.company_key
    );
  if v_mismatch > 0 then
    raise exception
      'Phase4D closed-list replacement blocked: horodateur_punch_zones.% company-code mismatch(es)',
      v_mismatch;
  end if;
end;
$$;

-- 6. Legacy gps_bases.compagnie — staging-only column. No-op when absent.
-- Fail closed on any compagnie / company_context / org-company mismatch
-- before dropping the historical closed list. Authority for the real
-- company remains the composite FK on
-- (organization_company_id, organization_id, company_context).
do $$
declare
  v_has_compagnie boolean;
  v_mismatch bigint;
  r record;
begin
  select exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.gps_bases'::regclass
      and a.attname = 'compagnie'
      and a.attnum > 0
      and not a.attisdropped
  ) into v_has_compagnie;

  if not v_has_compagnie then
    return;
  end if;

  execute $mismatch$
    select count(*)
    from public.gps_bases b
    left join public.organization_companies oc on oc.id = b.organization_company_id
    where b.compagnie is distinct from b.company_context
       or oc.id is null
       or oc.organization_id is distinct from b.organization_id
       or oc.company_code is distinct from b.compagnie
       or oc.company_code is distinct from b.company_context
  $mismatch$ into v_mismatch;

  if v_mismatch > 0 then
    raise exception
      'Phase4D closed-list replacement blocked: gps_bases.% compagnie/company_context/org mismatch(es)',
      v_mismatch;
  end if;

  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.gps_bases'::regclass
      and con.contype = 'c'
      and (
        con.conname = 'gps_bases_compagnie_check'
        or (
          pg_get_constraintdef(con.oid) ~* '\ycompagnie\y'
          and pg_get_constraintdef(con.oid) !~* '~'
          and (
            pg_get_constraintdef(con.oid) ~* '\yIN\s*\('
            or pg_get_constraintdef(con.oid) ~* '=\s*ANY\s*\(\s*ARRAY\['
          )
        )
      )
  loop
    execute format(
      'alter table public.gps_bases drop constraint if exists %I',
      r.conname
    );
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'gps_bases_compagnie_format_check'
      and conrelid = 'public.gps_bases'::regclass
  ) then
    execute $ddl$
      alter table public.gps_bases
        add constraint gps_bases_compagnie_format_check
        check (compagnie ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
    $ddl$;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'gps_bases_compagnie_company_context_consistency_check'
      and conrelid = 'public.gps_bases'::regclass
  ) then
    execute $ddl$
      alter table public.gps_bases
        add constraint gps_bases_compagnie_company_context_consistency_check
        check (compagnie = company_context)
    $ddl$;
  end if;
end;
$$;

-- 7. Declarative composite FK: row belongs to the org company whose code matches
-- the legacy projection. MATCH SIMPLE lets punch-zone company_key='all' skip
-- the FK while organization_company_id is null.
do $$
declare
  r record;
begin
  for r in
    select *
    from (
      values
        (
          'chauffeurs',
          'chauffeurs_org_company_code_consistency_fkey',
          array['organization_company_id', 'organization_id', 'primary_company']::text[]
        ),
        (
          'gps_bases',
          'gps_bases_org_company_code_consistency_fkey',
          array['organization_company_id', 'organization_id', 'company_context']::text[]
        ),
        (
          'horodateur_events',
          'horodateur_events_org_company_code_consistency_fkey',
          array['organization_company_id', 'organization_id', 'company_context']::text[]
        ),
        (
          'horodateur_shifts',
          'horodateur_shifts_org_company_code_consistency_fkey',
          array['organization_company_id', 'organization_id', 'company_context']::text[]
        ),
        (
          'horodateur_current_state',
          'horodateur_current_state_org_company_code_consistency_fkey',
          array['organization_company_id', 'organization_id', 'company_context']::text[]
        ),
        (
          'horodateur_punch_zones',
          'horodateur_punch_zones_org_company_code_consistency_fkey',
          array['organization_company_id', 'organization_id', 'company_key']::text[]
        )
    ) as expected(table_name, constraint_name, local_columns)
  loop
    if exists (
      select 1
      from pg_constraint con
      where con.conrelid = format('public.%I', r.table_name)::regclass
        and con.conname = r.constraint_name
    ) then
      continue;
    end if;

    execute format(
      'alter table public.%I add constraint %I foreign key (%s) references public.organization_companies (id, organization_id, company_code) on delete restrict',
      r.table_name,
      r.constraint_name,
      array_to_string(r.local_columns, ', ')
    );
  end loop;
end;
$$;

commit;
