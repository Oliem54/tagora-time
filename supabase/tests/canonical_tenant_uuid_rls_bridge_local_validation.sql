-- Local validation: canonical tenant UUID RLS bridge (Option C) + team tenant.
-- Requires BOTH migrations on a disposable local DB:
--   20260730190000_canonical_tenant_uuid_rls_bridge.sql (schema)
--   20260730191000_canonical_tenant_uuid_rls_hardening.sql (helpers/RLS/grants)
-- Transactional: BEGIN … ROLLBACK — no persistent fixtures/helpers.
-- Do not run against staging or production.

\set ON_ERROR_STOP on

-- Pre-clean leftovers from older non-transactional runs (outside txn).
delete from public.commission_book_access_grants
where owner_chauffeur_id in (910001, 910002, 910003);
delete from public.commission_entries
where chauffeur_id in (910001, 910002, 910003)
   or id in (
     'c0eeeeee-0001-4000-8000-0000000000a1'::uuid,
     'c0eeeeee-0001-4000-8000-0000000000b1'::uuid,
     'c0eeeeee-0001-4000-8000-0000000000a2'::uuid,
     'c0eeeeee-0001-4000-8000-0000000000b2'::uuid
   );
delete from public.commission_rules
where objective_id in (
  'c0ffffff-0001-4000-8000-0000000000a1'::uuid,
  'c0ffffff-0001-4000-8000-0000000000b1'::uuid,
  'c0ffffff-0001-4000-8000-0000000000a2'::uuid,
  'c0ffffff-0001-4000-8000-0000000000b2'::uuid,
  'c0ffffff-0001-4000-8000-0000000000a3'::uuid
);
delete from public.sales_objectives
where id in (
  'c0ffffff-0001-4000-8000-0000000000a1'::uuid,
  'c0ffffff-0001-4000-8000-0000000000b1'::uuid,
  'c0ffffff-0001-4000-8000-0000000000a2'::uuid,
  'c0ffffff-0001-4000-8000-0000000000b2'::uuid,
  'c0ffffff-0001-4000-8000-0000000000a3'::uuid
)
   or chauffeur_id in (910001, 910002, 910003);
delete from public.organization_memberships
where user_id in (
  '11111111-1111-1111-1111-111111111101'::uuid,
  '11111111-1111-1111-1111-111111111102'::uuid,
  '11111111-1111-1111-1111-111111111103'::uuid,
  '11111111-1111-1111-1111-111111111106'::uuid,
  '11111111-1111-1111-1111-111111111107'::uuid,
  '11111111-1111-1111-1111-111111111108'::uuid
);
delete from public.chauffeurs where id in (910001, 910002, 910003);
delete from public.organizations
where id in (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid
);
drop function if exists public._ct_bridge_set_claims(text, text[], uuid, jsonb);

begin;

create extension if not exists pgcrypto;

create or replace function public._ct_bridge_set_claims(
  p_role text,
  p_permissions text[] default '{}'::text[],
  p_sub uuid default '11111111-1111-1111-1111-111111111111',
  p_user_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_sub,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'role', p_role,
        'permissions', to_jsonb(coalesce(p_permissions, '{}'::text[]))
      ),
      'user_metadata', coalesce(p_user_metadata, '{}'::jsonb)
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

do $$
declare
  v_org_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  v_org_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  v_user_dir_a uuid := '11111111-1111-1111-1111-111111111101';
  v_user_dir_b uuid := '11111111-1111-1111-1111-111111111108';
  v_user_admin_a uuid := '11111111-1111-1111-1111-111111111102';
  v_user_admin_ab uuid := '11111111-1111-1111-1111-111111111103';
  v_user_emp_a uuid := '11111111-1111-1111-1111-111111111104';
  v_user_emp_b uuid := '11111111-1111-1111-1111-111111111105';
  v_user_dir_nomem uuid := '11111111-1111-1111-1111-111111111106';
  v_user_dir_susp uuid := '11111111-1111-1111-1111-111111111107';
  v_user_viewer uuid := '11111111-1111-1111-1111-111111111109';
  v_ch_a bigint := 910001;
  v_ch_b bigint := 910002;
  v_ch_null bigint := 910003;
  v_obj_pers_a uuid := 'c0ffffff-0001-4000-8000-0000000000a1';
  v_obj_pers_b uuid := 'c0ffffff-0001-4000-8000-0000000000b1';
  v_obj_team_a uuid := 'c0ffffff-0001-4000-8000-0000000000a2';
  v_obj_team_b uuid := 'c0ffffff-0001-4000-8000-0000000000b2';
  v_obj_team_null uuid := 'c0ffffff-0001-4000-8000-0000000000a3';
  v_entry_pers_a uuid := 'c0eeeeee-0001-4000-8000-0000000000a1';
  v_entry_pers_b uuid := 'c0eeeeee-0001-4000-8000-0000000000b1';
  v_entry_team_a uuid := 'c0eeeeee-0001-4000-8000-0000000000a2';
  v_entry_team_b uuid := 'c0eeeeee-0001-4000-8000-0000000000b2';
  v_rule_a uuid := 'c0dddddd-0001-4000-8000-0000000000a1';
  v_rule_b uuid := 'c0dddddd-0001-4000-8000-0000000000b1';
  v_grant_a uuid := 'c0cccccc-0001-4000-8000-0000000000a1';
  v_grant_b uuid := 'c0cccccc-0001-4000-8000-0000000000b1';
  v_count int;
  v_has_priv boolean;
  v_new_id uuid;
  v_row_count int;
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  insert into public.organizations (id, slug, legal_name, display_name, status)
  values
    (v_org_a, 'tenant-a', 'Tenant A Legal', 'Tenant A', 'active'),
    (v_org_b, 'tenant-b', 'Tenant B Legal', 'Tenant B', 'active');

  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (v_user_dir_a, 'authenticated', 'authenticated', 'dir-a@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_dir_b, 'authenticated', 'authenticated', 'dir-b@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_admin_a, 'authenticated', 'authenticated', 'admin-a@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_admin_ab, 'authenticated', 'authenticated', 'admin-ab@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_emp_a, 'authenticated', 'authenticated', 'emp-a@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_emp_b, 'authenticated', 'authenticated', 'emp-b@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_dir_nomem, 'authenticated', 'authenticated', 'dir-nomem@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_dir_susp, 'authenticated', 'authenticated', 'dir-susp@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_viewer, 'authenticated', 'authenticated', 'viewer@example.test', crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into public.organization_memberships (
    organization_id, user_id, role, status, joined_at, suspended_at
  ) values
    (v_org_a, v_user_dir_a, 'direction', 'active', now(), null),
    (v_org_b, v_user_dir_b, 'direction', 'active', now(), null),
    (v_org_a, v_user_admin_a, 'organization_admin', 'active', now(), null),
    (v_org_a, v_user_admin_ab, 'organization_admin', 'active', now(), null),
    (v_org_b, v_user_admin_ab, 'organization_admin', 'active', now(), null),
    (v_org_a, v_user_dir_susp, 'direction', 'suspended', now(), now());

  insert into public.chauffeurs (id, nom, auth_user_id, primary_company, organization_id, actif)
  values
    (v_ch_a, 'Chauffeur A', v_user_emp_a, 'oliem_solutions', v_org_a, true),
    (v_ch_b, 'Chauffeur B', v_user_emp_b, 'oliem_solutions', v_org_b, true),
    (v_ch_null, 'Chauffeur NULL org', null, 'oliem_solutions', null, true);

  insert into public.sales_objectives (
    id, title, chauffeur_id, team_name, period_start, period_end,
    target_type, target_amount, status, company_context, organization_id
  ) values
    (v_obj_pers_a, 'Obj Pers A', v_ch_a, null, current_date, current_date + 30, 'amount', 1000, 'active', 'qa_mismatch_a', null),
    (v_obj_pers_b, 'Obj Pers B', v_ch_b, null, current_date, current_date + 30, 'amount', 1000, 'active', 'qa_mismatch_b', null),
    (v_obj_team_a, 'Obj Team A', null, 'Team A', current_date, current_date + 30, 'amount', 1000, 'active', 'qa_team_a', v_org_a),
    (v_obj_team_b, 'Obj Team B', null, 'Team B', current_date, current_date + 30, 'amount', 1000, 'active', 'qa_team_b', v_org_b),
    (v_obj_team_null, 'Obj Team NULL', null, 'Team NULL', current_date, current_date + 30, 'amount', 1000, 'active', 'qa_team_null', null);

  insert into public.commission_entries (
    id, objective_id, chauffeur_id, label, period_start, period_end,
    status, sales_basis_amount, calculated_amount, organization_id
  ) values
    (v_entry_pers_a, v_obj_pers_a, v_ch_a, 'Entry Pers A', current_date, current_date + 30, 'estimated', 100, 10, null),
    (v_entry_pers_b, v_obj_pers_b, v_ch_b, 'Entry Pers B', current_date, current_date + 30, 'estimated', 200, 20, null),
    (v_entry_team_a, v_obj_team_a, null, 'Entry Team A', current_date, current_date + 30, 'estimated', 300, 30, v_org_a),
    (v_entry_team_b, v_obj_team_b, null, 'Entry Team B', current_date, current_date + 30, 'estimated', 400, 40, v_org_b);

  insert into public.commission_rules (
    id, objective_id, rule_name, rule_type, fixed_amount, is_active
  ) values
    (v_rule_a, v_obj_pers_a, 'Rule A', 'fixed', 5, true),
    (v_rule_b, v_obj_pers_b, 'Rule B', 'fixed', 7, true);

  insert into public.commission_book_access_grants (
    id, owner_chauffeur_id, viewer_user_id, viewer_role,
    granted_by_admin_id, can_view, can_edit
  ) values
    (v_grant_a, v_ch_a, v_user_viewer, 'direction', v_user_admin_a, true, false),
    (v_grant_b, v_ch_b, v_user_viewer, 'direction', v_user_admin_ab, true, false);

  -- I. Privileges
  select has_table_privilege('anon', 'public.chauffeurs', 'SELECT') into v_has_priv;
  if v_has_priv then raise exception 'ANON_HAS_SELECT_CHAUFFEURS'; end if;
  select has_table_privilege('authenticated', 'public.chauffeurs', 'TRUNCATE') into v_has_priv;
  if v_has_priv then raise exception 'AUTH_HAS_TRUNCATE'; end if;
  select has_table_privilege('authenticated', 'public.chauffeurs', 'TRIGGER') into v_has_priv;
  if v_has_priv then raise exception 'AUTH_HAS_TRIGGER'; end if;
  select has_table_privilege('authenticated', 'public.chauffeurs', 'REFERENCES') into v_has_priv;
  if v_has_priv then raise exception 'AUTH_HAS_REFERENCES'; end if;
  select has_table_privilege('service_role', 'public.chauffeurs', 'SELECT') into v_has_priv;
  if not v_has_priv then raise exception 'SERVICE_ROLE_MISSING_SELECT'; end if;

  if has_function_privilege('public', 'public.current_user_membership_organization_ids()', 'EXECUTE')
     or has_function_privilege('anon', 'public.current_user_membership_organization_ids()', 'EXECUTE')
  then
    raise exception 'PUBLIC_OR_ANON_EXECUTE_MEMBERSHIP_FN';
  end if;
  if has_function_privilege('public', 'public.commission_linked_row_is_writable_for_current_user(bigint,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.commission_linked_row_is_writable_for_current_user(bigint,uuid)', 'EXECUTE')
  then
    raise exception 'PUBLIC_OR_ANON_EXECUTE_WRITE_HELPER';
  end if;

  -- B. ANON
  perform set_config('role', 'anon', true);
  perform public._ct_bridge_set_claims('employe', '{}', v_user_emp_a);
  begin
    select count(*) into v_count from public.chauffeurs;
    if v_count <> 0 then raise exception 'ANON_READ_CHAUFFEURS count=%', v_count; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.sales_objectives (
      title, chauffeur_id, period_start, period_end, target_type, target_amount, status
    ) values ('anon-write', v_ch_a, current_date, current_date + 1, 'amount', 1, 'draft');
    raise exception 'ANON_INSERT_ALLOWED';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm = 'ANON_INSERT_ALLOWED' then raise; end if;
  end;
  begin
    update public.sales_objectives set title = 'anon-upd' where id = v_obj_pers_a;
    get diagnostics v_row_count = row_count;
    if v_row_count <> 0 then raise exception 'ANON_UPDATE_ALLOWED'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.sales_objectives where id = v_obj_pers_a;
    get diagnostics v_row_count = row_count;
    if v_row_count <> 0 then raise exception 'ANON_DELETE_ALLOWED'; end if;
  exception when insufficient_privilege then null;
  end;

  -- C. EMPLOYÉ A/B
  perform set_config('role', 'authenticated', true);
  perform public._ct_bridge_set_claims('employe', '{}', v_user_emp_a);
  select count(*) into v_count from public.chauffeurs;
  if v_count <> 1 then raise exception 'EMP_A_CHAUFFEURS count=%', v_count; end if;
  select count(*) into v_count from public.chauffeurs where id = v_ch_b;
  if v_count <> 0 then raise exception 'EMP_A_SEES_B'; end if;
  select count(*) into v_count from public.sales_objectives where id = v_obj_pers_a;
  if v_count <> 1 then raise exception 'EMP_A_MISSING_PERS'; end if;
  select count(*) into v_count from public.sales_objectives where id in (v_obj_pers_b, v_obj_team_a, v_obj_team_b);
  if v_count <> 0 then raise exception 'EMP_A_SEES_FOREIGN_OR_TEAM'; end if;
  select count(*) into v_count from public.commission_entries where id = v_entry_pers_a;
  if v_count <> 1 then raise exception 'EMP_A_MISSING_ENTRY'; end if;
  select count(*) into v_count from public.commission_entries where id in (v_entry_pers_b, v_entry_team_a, v_entry_team_b);
  if v_count <> 0 then raise exception 'EMP_A_SEES_FOREIGN_OR_TEAM_ENTRY'; end if;

  perform public._ct_bridge_set_claims('employe', '{}', v_user_emp_b);
  select count(*) into v_count from public.chauffeurs where id = v_ch_a;
  if v_count <> 0 then raise exception 'EMP_B_SEES_A'; end if;
  select count(*) into v_count from public.sales_objectives where id = v_obj_pers_b;
  if v_count <> 1 then raise exception 'EMP_B_MISSING_PERS'; end if;

  -- D. DIRECTION A/B
  perform public._ct_bridge_set_claims('direction', array['commissions'], v_user_dir_a);
  select count(*) into v_count from public.chauffeurs where organization_id = v_org_a;
  if v_count < 1 then raise exception 'DIR_A_MISSING_CH_A'; end if;
  select count(*) into v_count from public.chauffeurs where organization_id = v_org_b;
  if v_count <> 0 then raise exception 'DIR_A_LEAK_CH_B'; end if;
  select count(*) into v_count from public.sales_objectives where id in (v_obj_pers_a, v_obj_team_a);
  if v_count <> 2 then raise exception 'DIR_A_MISSING_A_ROWS count=%', v_count; end if;
  select count(*) into v_count from public.sales_objectives where id in (v_obj_pers_b, v_obj_team_b, v_obj_team_null);
  if v_count <> 0 then raise exception 'DIR_A_LEAK_B_OR_NULL_TEAM'; end if;
  select count(*) into v_count from public.commission_entries where id in (v_entry_pers_a, v_entry_team_a);
  if v_count <> 2 then raise exception 'DIR_A_MISSING_ENTRIES'; end if;
  select count(*) into v_count from public.commission_entries where id in (v_entry_pers_b, v_entry_team_b);
  if v_count <> 0 then raise exception 'DIR_A_ENTRY_LEAK_B'; end if;
  select count(*) into v_count from public.chauffeurs where id = v_ch_null;
  if v_count <> 0 then raise exception 'DIR_A_SEES_NULL_ORG_CH'; end if;

  perform public._ct_bridge_set_claims('direction', array['commissions'], v_user_dir_b);
  select count(*) into v_count from public.sales_objectives where id in (v_obj_pers_b, v_obj_team_b);
  if v_count <> 2 then raise exception 'DIR_B_MISSING_B_ROWS count=%', v_count; end if;
  select count(*) into v_count from public.sales_objectives where id in (v_obj_pers_a, v_obj_team_a);
  if v_count <> 0 then raise exception 'DIR_B_LEAK_A'; end if;

  perform public._ct_bridge_set_claims('direction', array['commissions'], v_user_dir_nomem);
  select count(*) into v_count from public.chauffeurs;
  if v_count <> 0 then raise exception 'DIR_NOMEM_SEES_ROWS'; end if;

  perform public._ct_bridge_set_claims('direction', array['commissions'], v_user_dir_susp);
  select count(*) into v_count from public.chauffeurs;
  if v_count <> 0 then raise exception 'DIR_SUSP_SEES_ROWS'; end if;

  -- E. ADMIN
  perform public._ct_bridge_set_claims('admin', '{}', v_user_admin_a);
  select count(*) into v_count from public.sales_objectives where id in (v_obj_pers_a, v_obj_team_a);
  if v_count <> 2 then raise exception 'ADMIN_A_MISSING_A'; end if;
  select count(*) into v_count from public.sales_objectives where id in (v_obj_pers_b, v_obj_team_b);
  if v_count <> 0 then raise exception 'ADMIN_A_LEAK_B'; end if;
  select count(*) into v_count from public.chauffeurs where id = v_ch_null;
  if v_count <> 0 then raise exception 'ADMIN_SEES_NULL_ORG_CH'; end if;
  select count(*) into v_count from public.sales_objectives where id = v_obj_team_null;
  if v_count <> 0 then raise exception 'ADMIN_SEES_NULL_TEAM_OBJ'; end if;

  perform public._ct_bridge_set_claims('admin', '{}', v_user_admin_ab);
  select count(*) into v_count from public.sales_objectives
  where id in (v_obj_pers_a, v_obj_pers_b, v_obj_team_a, v_obj_team_b);
  if v_count <> 4 then raise exception 'ADMIN_AB_MISSING_BOTH count=%', v_count; end if;
  select count(*) into v_count from public.sales_objectives where id = v_obj_team_null;
  if v_count <> 0 then raise exception 'ADMIN_AB_SEES_NULL_TEAM'; end if;

  -- F. DML objectives (Direction A)
  perform public._ct_bridge_set_claims('direction', array['commissions'], v_user_dir_a);

  insert into public.sales_objectives (
    title, chauffeur_id, period_start, period_end, target_type, target_amount, status, organization_id
  ) values (
    'Ins Pers A', v_ch_a, current_date, current_date + 7, 'amount', 50, 'draft', null
  ) returning id into v_new_id;
  if v_new_id is null then raise exception 'DIR_A_INSERT_PERS_FAILED'; end if;

  insert into public.sales_objectives (
    title, chauffeur_id, team_name, period_start, period_end, target_type, target_amount, status, organization_id
  ) values (
    'Ins Team A', null, 'Inserted Team A', current_date, current_date + 7, 'amount', 50, 'draft', v_org_a
  ) returning id into v_new_id;
  if v_new_id is null then raise exception 'DIR_A_INSERT_TEAM_FAILED'; end if;

  begin
    insert into public.sales_objectives (
      title, chauffeur_id, team_name, period_start, period_end, target_type, target_amount, status, organization_id
    ) values (
      'Ins Team No Org', null, 'Bad Team', current_date, current_date + 7, 'amount', 50, 'draft', null
    );
    raise exception 'DIR_A_TEAM_NULL_ORG_ALLOWED';
  exception
    when others then
      if sqlerrm = 'DIR_A_TEAM_NULL_ORG_ALLOWED' then raise; end if;
  end;

  begin
    insert into public.sales_objectives (
      title, chauffeur_id, team_name, period_start, period_end, target_type, target_amount, status, organization_id
    ) values (
      'Ins Team B as A', null, 'Bad Team B', current_date, current_date + 7, 'amount', 50, 'draft', v_org_b
    );
    raise exception 'DIR_A_TEAM_ORG_B_ALLOWED';
  exception
    when others then
      if sqlerrm = 'DIR_A_TEAM_ORG_B_ALLOWED' then raise; end if;
  end;

  begin
    insert into public.sales_objectives (
      title, chauffeur_id, period_start, period_end, target_type, target_amount, status, organization_id
    ) values (
      'Ins Ch B Org A', v_ch_b, current_date, current_date + 7, 'amount', 50, 'draft', v_org_a
    );
    raise exception 'DIR_A_CH_B_ORG_A_ALLOWED';
  exception
    when others then
      if sqlerrm = 'DIR_A_CH_B_ORG_A_ALLOWED' then raise; end if;
  end;

  update public.sales_objectives
  set title = 'Obj Team A Updated'
  where id = v_obj_team_a;
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then raise exception 'DIR_A_UPDATE_TEAM_A_FAILED'; end if;

  begin
    update public.sales_objectives
    set organization_id = v_org_b
    where id = v_obj_team_a;
    get diagnostics v_row_count = row_count;
    if v_row_count <> 0 then raise exception 'DIR_A_MOVE_TEAM_A_TO_B_ALLOWED'; end if;
  exception
    when others then
      if sqlerrm = 'DIR_A_MOVE_TEAM_A_TO_B_ALLOWED' then raise; end if;
  end;

  delete from public.sales_objectives where id = v_obj_team_b;
  get diagnostics v_row_count = row_count;
  if v_row_count <> 0 then raise exception 'DIR_A_DELETE_B_ALLOWED'; end if;

  -- F. DML entries
  insert into public.commission_entries (
    objective_id, chauffeur_id, label, period_start, period_end,
    status, sales_basis_amount, calculated_amount, organization_id
  ) values (
    v_obj_pers_a, v_ch_a, 'Ins Entry Pers A', current_date, current_date + 7, 'estimated', 11, 1, null
  ) returning id into v_new_id;
  if v_new_id is null then raise exception 'DIR_A_INSERT_ENTRY_PERS_FAILED'; end if;

  insert into public.commission_entries (
    objective_id, chauffeur_id, label, period_start, period_end,
    status, sales_basis_amount, calculated_amount, organization_id
  ) values (
    v_obj_team_a, null, 'Ins Entry Team A', current_date, current_date + 7, 'estimated', 12, 2, v_org_a
  ) returning id into v_new_id;
  if v_new_id is null then raise exception 'DIR_A_INSERT_ENTRY_TEAM_FAILED'; end if;

  begin
    insert into public.commission_entries (
      objective_id, chauffeur_id, label, period_start, period_end,
      status, sales_basis_amount, calculated_amount, organization_id
    ) values (
      v_obj_team_a, null, 'Bad Entry No Org', current_date, current_date + 7, 'estimated', 1, 1, null
    );
    raise exception 'DIR_A_ENTRY_TEAM_NULL_ORG_ALLOWED';
  exception
    when others then
      if sqlerrm = 'DIR_A_ENTRY_TEAM_NULL_ORG_ALLOWED' then raise; end if;
  end;

  begin
    insert into public.commission_entries (
      objective_id, chauffeur_id, label, period_start, period_end,
      status, sales_basis_amount, calculated_amount, organization_id
    ) values (
      v_obj_pers_b, v_ch_b, 'Bad Entry B', current_date, current_date + 7, 'estimated', 1, 1, v_org_a
    );
    raise exception 'DIR_A_ENTRY_CH_B_ORG_A_ALLOWED';
  exception
    when others then
      if sqlerrm = 'DIR_A_ENTRY_CH_B_ORG_A_ALLOWED' then raise; end if;
  end;

  -- G. RULES + GRANTS
  perform public._ct_bridge_set_claims('direction', array['commissions'], v_user_dir_a);
  select count(*) into v_count from public.commission_rules where id = v_rule_a;
  if v_count <> 1 then raise exception 'DIR_A_MISSING_RULE_A'; end if;
  select count(*) into v_count from public.commission_rules where id = v_rule_b;
  if v_count <> 0 then raise exception 'DIR_A_SEES_RULE_B'; end if;

  perform public._ct_bridge_set_claims('direction', array['commissions'], v_user_dir_b);
  select count(*) into v_count from public.commission_rules where id = v_rule_b;
  if v_count <> 1 then raise exception 'DIR_B_MISSING_RULE_B'; end if;
  select count(*) into v_count from public.commission_rules where id = v_rule_a;
  if v_count <> 0 then raise exception 'DIR_B_SEES_RULE_A'; end if;

  perform public._ct_bridge_set_claims('admin', '{}', v_user_admin_a);
  select count(*) into v_count from public.commission_book_access_grants where id = v_grant_a;
  if v_count <> 1 then raise exception 'ADMIN_A_MISSING_GRANT_A'; end if;
  select count(*) into v_count from public.commission_book_access_grants where id = v_grant_b;
  if v_count <> 0 then raise exception 'ADMIN_A_SEES_GRANT_B'; end if;

  begin
    insert into public.commission_book_access_grants (
      owner_chauffeur_id, viewer_user_id, viewer_role, granted_by_admin_id, can_view, can_edit
    ) values (
      v_ch_b, v_user_viewer, 'direction', v_user_admin_a, true, false
    );
    raise exception 'ADMIN_A_GRANT_OWNER_B_ALLOWED';
  exception
    when others then
      if sqlerrm = 'ADMIN_A_GRANT_OWNER_B_ALLOWED' then raise; end if;
  end;

  begin
    insert into public.commission_book_access_grants (
      owner_chauffeur_id, viewer_user_id, viewer_role, granted_by_admin_id, can_view, can_edit
    ) values (
      v_ch_a, v_user_dir_a, 'direction', v_user_admin_a, true, true
    );
    raise exception 'ADMIN_A_GRANT_CAN_EDIT_TRUE_ALLOWED';
  exception
    when others then
      if sqlerrm = 'ADMIN_A_GRANT_CAN_EDIT_TRUE_ALLOWED' then raise; end if;
  end;

  update public.commission_book_access_grants
  set notes = 'ok-a'
  where id = v_grant_a;
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then raise exception 'ADMIN_A_UPDATE_GRANT_A_FAILED'; end if;

  update public.commission_book_access_grants
  set notes = 'leak-b'
  where id = v_grant_b;
  get diagnostics v_row_count = row_count;
  if v_row_count <> 0 then raise exception 'ADMIN_A_UPDATE_GRANT_B_ALLOWED'; end if;

  -- H. user_metadata bypass
  perform public._ct_bridge_set_claims(
    'direction',
    '{}',
    v_user_dir_nomem,
    jsonb_build_object(
      'permissions', jsonb_build_array('commissions'),
      'primary_company', 'tenant-a',
      'allowed_companies', jsonb_build_array('tenant-a'),
      'organization_id', v_org_a::text
    )
  );
  select count(*) into v_count from public.chauffeurs;
  if v_count <> 0 then raise exception 'USER_METADATA_BYPASS'; end if;

  -- J. SERVICE_ROLE functional
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_count from public.sales_objectives
  where id in (v_obj_pers_a, v_obj_pers_b, v_obj_team_a, v_obj_team_b, v_obj_team_null);
  if v_count <> 5 then raise exception 'SERVICE_ROLE_READ_FAILED count=%', v_count; end if;

  insert into public.sales_objectives (
    title, chauffeur_id, team_name, period_start, period_end,
    target_type, target_amount, status, organization_id
  ) values (
    'Service Team', null, 'Svc Team', current_date, current_date + 3, 'amount', 9, 'draft', v_org_b
  ) returning id into v_new_id;
  if v_new_id is null then raise exception 'SERVICE_ROLE_INSERT_FAILED'; end if;

  perform set_config('role', 'postgres', true);
  raise notice 'CANONICAL_TENANT_UUID_RLS_BRIDGE_LOCAL_VALIDATION_PASS';
end;
$$;

rollback;

-- A. Prove ROLLBACK removed helper and fixtures
do $$
begin
  if to_regprocedure('public._ct_bridge_set_claims(text,text[],uuid,jsonb)') is not null then
    raise exception 'HELPER_PERSISTED_AFTER_ROLLBACK';
  end if;
  if exists (
    select 1 from public.organizations
    where id in (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid,
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid
    )
  ) then
    raise exception 'ORG_FIXTURES_PERSISTED_AFTER_ROLLBACK';
  end if;
  if exists (
    select 1 from public.chauffeurs where id in (910001, 910002, 910003)
  ) then
    raise exception 'CHAUFFEUR_FIXTURES_PERSISTED_AFTER_ROLLBACK';
  end if;
  raise notice 'CANONICAL_TENANT_UUID_RLS_BRIDGE_ROLLBACK_CONFIRMED';
end;
$$;
