-- =============================================================================
-- STAGING ONLY — controlled tenant UUID backfill (manual)
-- =============================================================================
-- Project: TAGORA Time
-- Branch context: fix/canonical-tenant-uuid-rls-bridge
-- Prerequisite schema migration:
--   20260730190000_canonical_tenant_uuid_rls_bridge.sql
-- Must run BEFORE:
--   20260730191000_canonical_tenant_uuid_rls_hardening.sql
--
-- RULES
-- - STAGING UNIQUEMENT (qokyobcvplzufshydhih) after explicit GO Martin.
-- - Do NOT run in Production (qcgvzdlfsxybrmloijpt).
-- - Relational mappings only (auth.uid path via memberships).
-- - primary_company is NOT an authority.
-- - company_context is NOT an authority.
-- - No environment organization UUID hardcoded as authorization.
-- - Default end state: ROLLBACK (no durable write unless Martin GO + explicit COMMIT).
--
-- ARMING (required in the same SQL session before BEGIN succeeds past the guard):
--   select set_config(
--     'tagora.allow_staging_tenant_backfill',
--     'GO_MARTIN_STAGING_BACKFILL_ARMED',
--     false
--   );
-- Without this exact in-session setting, the script raises and rolls back.
-- This is a deliberate manual gate: SQL cannot reliably distinguish staging vs
-- Production by database name alone in managed Supabase.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_armed text := nullif(current_setting('tagora.allow_staging_tenant_backfill', true), '');
  v_ch_count int;
  v_obj_count int;
  v_entry_count int;
  v_rule_count int;
  v_grant_count int;
  v_team_obj int;
  v_team_entry int;
  v_updated int;
  v_bad int;
  v_ids bigint[];
begin
  -- ---------------------------------------------------------------------------
  -- Environment arming (manual; refuses by default)
  -- ---------------------------------------------------------------------------
  if v_armed is distinct from 'GO_MARTIN_STAGING_BACKFILL_ARMED' then
    raise exception
      'STAGING_BACKFILL_NOT_ARMED: set tagora.allow_staging_tenant_backfill=GO_MARTIN_STAGING_BACKFILL_ARMED in this session after explicit Martin GO. Refuses accidental Production execution.';
  end if;

  -- ---------------------------------------------------------------------------
  -- Schema presence
  -- ---------------------------------------------------------------------------
  if to_regclass('public.organizations') is null
     or to_regclass('public.organization_memberships') is null then
    raise exception 'MISSING_ORG_TABLES';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chauffeurs' and column_name = 'organization_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sales_objectives' and column_name = 'organization_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commission_entries' and column_name = 'organization_id'
  ) then
    raise exception 'MISSING_ORGANIZATION_ID_COLUMNS: apply schema migration 20260730190000 first';
  end if;

  -- ---------------------------------------------------------------------------
  -- Inventory assertions (must match staging READ-ONLY audit)
  -- ---------------------------------------------------------------------------
  select count(*) into v_ch_count from public.chauffeurs;
  if v_ch_count <> 2 then
    raise exception 'CHAUFFEUR_COUNT_UNEXPECTED count=%', v_ch_count;
  end if;

  if exists (select 1 from public.chauffeurs where auth_user_id is null) then
    raise exception 'CHAUFFEUR_MISSING_AUTH_USER_ID';
  end if;

  -- Exactly one active membership -> active non-deleted org per chauffeur
  if exists (
    select c.id
    from public.chauffeurs c
    left join lateral (
      select m.organization_id
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = c.auth_user_id
        and m.status = 'active'
        and o.status = 'active'
        and o.deleted_at is null
    ) cand on true
    group by c.id
    having count(cand.organization_id) <> 1
  ) then
    raise exception 'CHAUFFEUR_MEMBERSHIP_NOT_EXACTLY_ONE';
  end if;

  select count(*) into v_team_obj
  from public.sales_objectives
  where chauffeur_id is null;
  if v_team_obj <> 0 then
    raise exception 'TEAM_OBJECTIVES_PRESENT count=%', v_team_obj;
  end if;

  select count(*) into v_team_entry
  from public.commission_entries
  where chauffeur_id is null;
  if v_team_entry <> 0 then
    raise exception 'TEAM_ENTRIES_PRESENT count=%', v_team_entry;
  end if;

  select count(*) into v_obj_count
  from public.sales_objectives
  where chauffeur_id is not null;
  if v_obj_count <> 5 then
    raise exception 'PERSONAL_OBJECTIVE_COUNT_UNEXPECTED count=%', v_obj_count;
  end if;

  select count(*) into v_entry_count
  from public.commission_entries
  where chauffeur_id is not null;
  if v_entry_count <> 4 then
    raise exception 'PERSONAL_ENTRY_COUNT_UNEXPECTED count=%', v_entry_count;
  end if;

  select count(*) into v_rule_count from public.commission_rules;
  if v_rule_count <> 4 then
    raise exception 'RULE_COUNT_UNEXPECTED count=%', v_rule_count;
  end if;

  select count(*) into v_grant_count from public.commission_book_access_grants;
  if v_grant_count <> 1 then
    raise exception 'GRANT_COUNT_UNEXPECTED count=%', v_grant_count;
  end if;

  if exists (
    select 1
    from public.sales_objectives so
    left join public.chauffeurs c on c.id = so.chauffeur_id
    where so.chauffeur_id is not null and c.id is null
  ) then
    raise exception 'OBJECTIVE_ORPHAN_CHAUFFEUR';
  end if;

  if exists (
    select 1
    from public.commission_entries ce
    left join public.chauffeurs c on c.id = ce.chauffeur_id
    where ce.chauffeur_id is not null and c.id is null
  ) then
    raise exception 'ENTRY_ORPHAN_CHAUFFEUR';
  end if;

  if exists (
    select 1
    from public.commission_rules r
    left join public.sales_objectives so on so.id = r.objective_id
    where so.id is null
  ) then
    raise exception 'RULE_ORPHAN_OBJECTIVE';
  end if;

  if exists (
    select 1
    from public.commission_book_access_grants g
    left join public.chauffeurs c on c.id = g.owner_chauffeur_id
    where c.id is null
  ) then
    raise exception 'GRANT_ORPHAN_OWNER';
  end if;

  -- Viewer must already be active member of the owner's unique candidate org
  if exists (
    select 1
    from public.commission_book_access_grants g
    join public.chauffeurs c on c.id = g.owner_chauffeur_id
    join lateral (
      select m.organization_id
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = c.auth_user_id
        and m.status = 'active'
        and o.status = 'active'
        and o.deleted_at is null
    ) owner_org on true
    where not exists (
      select 1
      from public.organization_memberships vm
      join public.organizations vo on vo.id = vm.organization_id
      where vm.user_id = g.viewer_user_id
        and vm.organization_id = owner_org.organization_id
        and vm.status = 'active'
        and vo.status = 'active'
        and vo.deleted_at is null
    )
  ) then
    raise exception 'GRANT_VIEWER_NOT_ACTIVE_SAME_ORG';
  end if;

  -- No contradictory pre-existing organization_id values
  if exists (
    select 1
    from public.chauffeurs c
    join lateral (
      select m.organization_id
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = c.auth_user_id
        and m.status = 'active'
        and o.status = 'active'
        and o.deleted_at is null
    ) cand on true
    where c.organization_id is not null
      and c.organization_id is distinct from cand.organization_id
  ) then
    raise exception 'CHAUFFEUR_ORGANIZATION_ID_CONTRADICTION';
  end if;

  -- ---------------------------------------------------------------------------
  -- Backfill chauffeurs (relational; ids 1/2 are secondary assertion only)
  -- ---------------------------------------------------------------------------
  update public.chauffeurs c
  set organization_id = cand.organization_id
  from (
    select c2.id as chauffeur_id, m.organization_id
    from public.chauffeurs c2
    join public.organization_memberships m
      on m.user_id = c2.auth_user_id
     and m.status = 'active'
    join public.organizations o
      on o.id = m.organization_id
     and o.status = 'active'
     and o.deleted_at is null
  ) cand
  where c.id = cand.chauffeur_id;

  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'CHAUFFEUR_UPDATE_COUNT_UNEXPECTED count=%', v_updated;
  end if;

  select array_agg(id order by id) into v_ids from public.chauffeurs;
  if v_ids is distinct from array[1::bigint, 2::bigint] then
    raise exception 'CHAUFFEUR_IDS_SECONDARY_ASSERT_FAILED ids=%', v_ids;
  end if;

  select count(*) into v_bad
  from public.chauffeurs
  where organization_id is null;
  if v_bad <> 0 then
    raise exception 'CHAUFFEUR_NULL_ORG_AFTER_BACKFILL count=%', v_bad;
  end if;

  -- ---------------------------------------------------------------------------
  -- Backfill personal objectives from chauffeur tenant
  -- ---------------------------------------------------------------------------
  update public.sales_objectives so
  set organization_id = c.organization_id
  from public.chauffeurs c
  where so.chauffeur_id = c.id
    and so.chauffeur_id is not null;

  get diagnostics v_updated = row_count;
  if v_updated <> 5 then
    raise exception 'OBJECTIVE_UPDATE_COUNT_UNEXPECTED count=%', v_updated;
  end if;

  select count(*) into v_bad
  from public.sales_objectives so
  join public.chauffeurs c on c.id = so.chauffeur_id
  where so.organization_id is distinct from c.organization_id
     or so.organization_id is null;
  if v_bad <> 0 then
    raise exception 'OBJECTIVE_MISMATCH_AFTER_BACKFILL count=%', v_bad;
  end if;

  -- ---------------------------------------------------------------------------
  -- Backfill personal entries from chauffeur tenant (+ consistency vs objective)
  -- ---------------------------------------------------------------------------
  update public.commission_entries ce
  set organization_id = c.organization_id
  from public.chauffeurs c
  where ce.chauffeur_id = c.id
    and ce.chauffeur_id is not null;

  get diagnostics v_updated = row_count;
  if v_updated <> 4 then
    raise exception 'ENTRY_UPDATE_COUNT_UNEXPECTED count=%', v_updated;
  end if;

  select count(*) into v_bad
  from public.commission_entries ce
  join public.chauffeurs c on c.id = ce.chauffeur_id
  left join public.sales_objectives so on so.id = ce.objective_id
  where ce.organization_id is null
     or ce.organization_id is distinct from c.organization_id
     or (
       so.id is not null
       and ce.organization_id is distinct from so.organization_id
     );
  if v_bad <> 0 then
    raise exception 'ENTRY_MISMATCH_AFTER_BACKFILL count=%', v_bad;
  end if;

  -- ---------------------------------------------------------------------------
  -- Rules / grants validation (no UPDATE)
  -- ---------------------------------------------------------------------------
  select count(*) into v_bad
  from public.commission_rules r
  join public.sales_objectives so on so.id = r.objective_id
  join public.chauffeurs c on c.id = so.chauffeur_id
  where so.organization_id is null
     or c.organization_id is null
     or so.organization_id is distinct from c.organization_id;
  if v_bad <> 0 then
    raise exception 'RULE_TENANT_MISMATCH count=%', v_bad;
  end if;

  select count(*) into v_rule_count from public.commission_rules;
  if v_rule_count <> 4 then
    raise exception 'RULE_COUNT_POST count=%', v_rule_count;
  end if;

  select count(*) into v_bad
  from public.commission_book_access_grants g
  join public.chauffeurs c on c.id = g.owner_chauffeur_id
  where c.organization_id is null
     or not exists (
       select 1
       from public.organization_memberships vm
       join public.organizations vo on vo.id = vm.organization_id
       where vm.user_id = g.viewer_user_id
         and vm.organization_id = c.organization_id
         and vm.status = 'active'
         and vo.status = 'active'
         and vo.deleted_at is null
     );
  if v_bad <> 0 then
    raise exception 'GRANT_TENANT_MISMATCH count=%', v_bad;
  end if;

  select count(*) into v_grant_count from public.commission_book_access_grants;
  if v_grant_count <> 1 then
    raise exception 'GRANT_COUNT_POST count=%', v_grant_count;
  end if;

  -- ---------------------------------------------------------------------------
  -- Final technical counts (no PII)
  -- ---------------------------------------------------------------------------
  raise notice 'BACKFILL_ASSERT_OK chauffeurs=% objectives=% entries=% rules=% grants=%',
    (select count(*) from public.chauffeurs where organization_id is not null),
    (select count(*) from public.sales_objectives where organization_id is not null),
    (select count(*) from public.commission_entries where organization_id is not null),
    (select count(*) from public.commission_rules),
    (select count(*) from public.commission_book_access_grants);

  raise notice 'BACKFILL_READY_FOR_MARTIN_REVIEW — default ROLLBACK follows; COMMIT requires separate GO';
end;
$$;

-- Default durable behavior: no write kept.
rollback;
