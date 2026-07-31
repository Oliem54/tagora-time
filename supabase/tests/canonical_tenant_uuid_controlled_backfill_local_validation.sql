-- Local validation of controlled backfill UPDATE patterns (relational).
-- Disposable fixtures inside BEGIN/ROLLBACK. Not the staging script.
-- Do not run against staging or production.

\set ON_ERROR_STOP on

begin;

create extension if not exists pgcrypto;

do $$
declare
  v_org uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  v_user_a uuid := '11111111-1111-1111-1111-111111111201';
  v_user_b uuid := '11111111-1111-1111-1111-111111111202';
  v_viewer uuid := '11111111-1111-1111-1111-111111111203';
  v_admin uuid := '11111111-1111-1111-1111-111111111204';
  v_ch_a bigint := 920001;
  v_ch_b bigint := 920002;
  v_obj uuid[] := array[
    'd0ffffff-0001-4000-8000-0000000000a1'::uuid,
    'd0ffffff-0001-4000-8000-0000000000a2'::uuid,
    'd0ffffff-0001-4000-8000-0000000000a3'::uuid,
    'd0ffffff-0001-4000-8000-0000000000b1'::uuid,
    'd0ffffff-0001-4000-8000-0000000000b2'::uuid
  ];
  v_entry uuid[] := array[
    'd0eeeeee-0001-4000-8000-0000000000a1'::uuid,
    'd0eeeeee-0001-4000-8000-0000000000a2'::uuid,
    'd0eeeeee-0001-4000-8000-0000000000b1'::uuid,
    'd0eeeeee-0001-4000-8000-0000000000b2'::uuid
  ];
  v_updated int;
  v_bad int;
begin
  insert into public.organizations (id, slug, legal_name, display_name, status)
  values (v_org, 'backfill-local-a', 'Backfill Local A', 'Backfill Local A', 'active');

  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (v_user_a, 'authenticated', 'authenticated', 'bf-a@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_b, 'authenticated', 'authenticated', 'bf-b@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_viewer, 'authenticated', 'authenticated', 'bf-v@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_admin, 'authenticated', 'authenticated', 'bf-admin@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into public.organization_memberships (
    organization_id, user_id, role, status, joined_at, suspended_at
  ) values
    (v_org, v_user_a, 'employe', 'active', now(), null),
    (v_org, v_user_b, 'employe', 'active', now(), null),
    (v_org, v_viewer, 'direction', 'active', now(), null);

  insert into public.chauffeurs (id, nom, auth_user_id, primary_company, organization_id, actif)
  values
    (v_ch_a, 'BF A', v_user_a, 'oliem_solutions', null, true),
    (v_ch_b, 'BF B', v_user_b, 'oliem_solutions', null, true);

  insert into public.sales_objectives (
    id, title, chauffeur_id, period_start, period_end, target_type, target_amount, status, company_context, organization_id
  ) values
    (v_obj[1], 'BF Obj A1', v_ch_a, current_date, current_date + 30, 'amount', 10, 'active', 'ignore_me', null),
    (v_obj[2], 'BF Obj A2', v_ch_a, current_date, current_date + 30, 'amount', 10, 'active', 'ignore_me', null),
    (v_obj[3], 'BF Obj A3', v_ch_a, current_date, current_date + 30, 'amount', 10, 'active', 'ignore_me', null),
    (v_obj[4], 'BF Obj B1', v_ch_b, current_date, current_date + 30, 'amount', 10, 'active', 'ignore_me', null),
    (v_obj[5], 'BF Obj B2', v_ch_b, current_date, current_date + 30, 'amount', 10, 'active', 'ignore_me', null);

  insert into public.commission_entries (
    id, objective_id, chauffeur_id, label, period_start, period_end, status, sales_basis_amount, calculated_amount, organization_id
  ) values
    (v_entry[1], v_obj[1], v_ch_a, 'E1', current_date, current_date + 30, 'estimated', 1, 1, null),
    (v_entry[2], v_obj[2], v_ch_a, 'E2', current_date, current_date + 30, 'estimated', 1, 1, null),
    (v_entry[3], v_obj[4], v_ch_b, 'E3', current_date, current_date + 30, 'estimated', 1, 1, null),
    (v_entry[4], v_obj[5], v_ch_b, 'E4', current_date, current_date + 30, 'estimated', 1, 1, null);

  insert into public.commission_rules (objective_id, rule_name, rule_type, fixed_amount, is_active)
  values
    (v_obj[1], 'R1', 'fixed', 1, true),
    (v_obj[2], 'R2', 'fixed', 1, true),
    (v_obj[4], 'R3', 'fixed', 1, true),
    (v_obj[5], 'R4', 'fixed', 1, true);

  insert into public.commission_book_access_grants (
    owner_chauffeur_id, viewer_user_id, viewer_role, granted_by_admin_id, can_view, can_edit
  ) values (v_ch_a, v_viewer, 'direction', v_admin, true, false);

  -- Relational chauffeur backfill (same pattern as staging script)
  update public.chauffeurs c
  set organization_id = cand.organization_id
  from (
    select c2.id as chauffeur_id, m.organization_id
    from public.chauffeurs c2
    join public.organization_memberships m
      on m.user_id = c2.auth_user_id and m.status = 'active'
    join public.organizations o
      on o.id = m.organization_id and o.status = 'active' and o.deleted_at is null
    where c2.id in (v_ch_a, v_ch_b)
  ) cand
  where c.id = cand.chauffeur_id;

  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'LOCAL_BF_CH_UPDATE count=%', v_updated;
  end if;

  update public.sales_objectives so
  set organization_id = c.organization_id
  from public.chauffeurs c
  where so.chauffeur_id = c.id
    and so.id = any (v_obj);

  get diagnostics v_updated = row_count;
  if v_updated <> 5 then
    raise exception 'LOCAL_BF_OBJ_UPDATE count=%', v_updated;
  end if;

  update public.commission_entries ce
  set organization_id = c.organization_id
  from public.chauffeurs c
  where ce.chauffeur_id = c.id
    and ce.id = any (v_entry);

  get diagnostics v_updated = row_count;
  if v_updated <> 4 then
    raise exception 'LOCAL_BF_ENTRY_UPDATE count=%', v_updated;
  end if;

  select count(*) into v_bad
  from public.commission_entries ce
  join public.chauffeurs c on c.id = ce.chauffeur_id
  join public.sales_objectives so on so.id = ce.objective_id
  where ce.id = any (v_entry)
    and (
      ce.organization_id is distinct from c.organization_id
      or ce.organization_id is distinct from so.organization_id
    );
  if v_bad <> 0 then
    raise exception 'LOCAL_BF_ENTRY_MISMATCH count=%', v_bad;
  end if;

  -- company_context must not have been used as authority (still ignore_me)
  if exists (
    select 1 from public.sales_objectives
    where id = any (v_obj) and company_context is distinct from 'ignore_me'
  ) then
    raise exception 'LOCAL_BF_COMPANY_CONTEXT_MUTATED';
  end if;

  raise notice 'CANONICAL_TENANT_UUID_CONTROLLED_BACKFILL_LOCAL_VALIDATION_PASS';
end;
$$;

rollback;

do $$
begin
  if exists (select 1 from public.chauffeurs where id in (920001, 920002)) then
    raise exception 'LOCAL_BF_FIXTURES_PERSISTED';
  end if;
  raise notice 'CANONICAL_TENANT_UUID_CONTROLLED_BACKFILL_LOCAL_ROLLBACK_CONFIRMED';
end;
$$;
