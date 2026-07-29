-- Bloc 6D Phase 2 — validation locale SQL / versions / immutabilité / RLS.
-- Prérequis: bootstrap + migration 6D appliqués.
-- Ne pas exécuter sur staging ni production.

\set ON_ERROR_STOP on

create or replace function public._bloc6d_set_claims(
  p_role text,
  p_org text,
  p_permissions text[] default '{}'::text[],
  p_sub uuid default '11111111-1111-1111-1111-111111111111'
)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_sub,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'role', p_role,
        'primary_company', p_org,
        'company', p_org,
        'allowed_companies', to_jsonb(array[p_org]),
        'permissions', to_jsonb(coalesce(p_permissions, '{}'::text[]))
      )
    )::text,
    true
  );
end;
$$;

create or replace function public._bloc6d_clear_claims()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Résolution SQL alignée TS: [from, to) ; applicable si scheduled|active|archived
create or replace function public._bloc6d_resolve_version(
  p_plan_id uuid,
  p_event_date date
)
returns table (
  plan_version_id uuid,
  version_number integer,
  resolution_status text
)
language plpgsql as $$
declare
  v_count int;
  v_id uuid;
  v_num int;
begin
  select count(*), (array_agg(v.id))[1], (array_agg(v.version_number))[1]
    into v_count, v_id, v_num
  from public.employee_compensation_plan_versions v
  where v.plan_id = p_plan_id
    and v.status in ('scheduled', 'active', 'archived')
    and v.effective_from <= p_event_date
    and (v.effective_to is null or p_event_date < v.effective_to);

  if v_count = 0 then
    return query select null::uuid, null::integer, 'missing_plan';
  elsif v_count = 1 then
    return query select v_id, v_num, 'resolved';
  else
    return query select null::uuid, null::integer, 'ambiguous';
  end if;
end;
$$;

grant select, insert, update, delete on public.employee_compensation_plans to authenticated;
grant select, insert, update, delete on public.employee_compensation_plan_versions to authenticated;
grant select, insert, update, delete on public.employee_compensation_plan_rules to authenticated;
grant select, insert, update, delete on public.commission_categories to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public._bloc6d_set_claims(text, text, text[], uuid) to authenticated;
grant execute on function public._bloc6d_clear_claims() to authenticated;
grant execute on function public.current_user_organization_ids() to authenticated;
grant execute on function public.user_can_access_commission_organization(text) to authenticated;
grant execute on function public.normalize_organization_id(text) to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.is_direction_user() to authenticated;
grant execute on function public.has_app_permission(text) to authenticated;
grant execute on function public.current_app_permissions() to authenticated;
grant execute on function auth.jwt() to authenticated, anon;

do $$
declare
  v_org_a text := 'oliem_solutions';
  v_org_b text := 'titan_produits_industriels';
  v_emp_a1 bigint;
  v_emp_a2 bigint;
  v_emp_b1 bigint;
  v_emp_a1_in_b bigint;
  v_cat_a_vis uuid;
  v_cat_a_hid uuid;
  v_cat_a_inactive uuid;
  v_cat_b uuid;
  v_plan_a1 uuid;
  v_plan_b1 uuid;
  v_plan_a2 uuid;
  v_ver_a1_v1 uuid;
  v_ver_a1_v2 uuid;
  v_ver_clone uuid;
  v_rule_id uuid;
  v_rule_clone uuid;
  v_count int;
  v_status text;
  v_vid uuid;
  v_vnum int;
  v_admin_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_admin_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_dir_a uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_idx_count int;
begin
  -- Nettoyage jetable (bypass trigger immutabilité règles publiées)
  set local session_replication_role = replica;
  delete from public.employee_compensation_plan_rules
  where organization_id in (v_org_a, v_org_b);
  delete from public.employee_compensation_plan_versions
  where organization_id in (v_org_a, v_org_b);
  update public.employee_compensation_plans set current_version_id = null
  where organization_id in (v_org_a, v_org_b);
  delete from public.employee_compensation_plans
  where organization_id in (v_org_a, v_org_b);
  set local session_replication_role = origin;
  delete from public.commission_categories
  where organization_id in (v_org_a, v_org_b);
  delete from public.chauffeurs
  where nom in ('emp_a1', 'emp_a2', 'emp_b1', 'emp_a1_in_b');
  delete from auth.users
  where id in (v_admin_a, v_admin_b, v_dir_a);

  insert into auth.users (id) values (v_admin_a), (v_admin_b), (v_dir_a)
  on conflict do nothing;

  select coalesce(max(id), 0) + 2000
  into v_emp_a1
  from public.chauffeurs;

  v_emp_a2 := v_emp_a1 + 1;

  v_emp_b1 := v_emp_a1 + 2;

  v_emp_a1_in_b := v_emp_a1 + 3;

  insert into public.chauffeurs (id, primary_company, nom)
  values (v_emp_a1, v_org_a, 'emp_a1');

  insert into public.chauffeurs (id, primary_company, nom)
  values (v_emp_a2, v_org_a, 'emp_a2');

  insert into public.chauffeurs (id, primary_company, nom)
  values (v_emp_b1, v_org_b, 'emp_b1');

  insert into public.chauffeurs (id, primary_company, nom)
  values (v_emp_a1_in_b, v_org_b, 'emp_a1_in_b');

  insert into public.commission_categories (
    organization_id, code, label, is_visible, is_active, display_order
  ) values
    (v_org_a, 'cat_vis', 'Catégorie visible A', true, true, 1)
    returning id into v_cat_a_vis;

  insert into public.commission_categories (
    organization_id, code, label, is_visible, is_active, display_order
  ) values
    (v_org_a, 'cat_hid', 'Catégorie masquée A', false, true, 2)
    returning id into v_cat_a_hid;

  insert into public.commission_categories (
    organization_id, code, label, is_visible, is_active, display_order
  ) values
    (v_org_a, 'cat_off', 'Catégorie inactive A', true, false, 3)
    returning id into v_cat_a_inactive;

  insert into public.commission_categories (
    organization_id, code, label, is_visible, is_active, display_order
  ) values
    (v_org_b, 'cat_b', 'Catégorie B', true, true, 1)
    returning id into v_cat_b;

  raise notice 'SEED_OK emp_a1=% emp_a2=% emp_b1=%', v_emp_a1, v_emp_a2, v_emp_b1;

  -- =========================================================================
  -- organization_id
  -- =========================================================================
  begin
    insert into public.employee_compensation_plans (
      organization_id, employee_id, plan_code, name, created_by
    ) values ('Org_Bad', v_emp_a1, 'p_bad', 'Bad', v_admin_a);
    raise exception 'mixed case org should fail';
  exception when check_violation then null;
  when others then
    if sqlerrm not ilike '%normalisé%' and sqlerrm not ilike '%check%' then raise; end if;
  end;

  begin
    insert into public.employee_compensation_plans (
      organization_id, employee_id, plan_code, name, created_by
    ) values ('org-bad', v_emp_a1, 'p_bad', 'Bad', v_admin_a);
    raise exception 'hyphen org should fail';
  exception when check_violation then null;
  when others then
    if sqlerrm not ilike '%normalisé%' and sqlerrm not ilike '%check%' then raise; end if;
  end;

  begin
    insert into public.employee_compensation_plans (
      organization_id, employee_id, plan_code, name, created_by
    ) values ('org bad', v_emp_a1, 'p_bad', 'Bad', v_admin_a);
    raise exception 'space org should fail';
  exception when check_violation then null;
  when others then
    if sqlerrm not ilike '%normalisé%' and sqlerrm not ilike '%check%' then raise; end if;
  end;

  if public.normalize_organization_id('  Org_A  ') is distinct from 'org_a' then
    raise exception 'normalize trim+lower failed';
  end if;
  if public.normalize_organization_id('org-a') is not null then
    raise exception 'normalize should reject hyphen';
  end if;

  -- =========================================================================
  -- Plan principal
  -- =========================================================================
  insert into public.employee_compensation_plans (
    organization_id, employee_id, plan_code, name, status, created_by
  ) values (
    v_org_a, v_emp_a1, 'plan_a1', 'Plan principal A1', 'active', v_admin_a
  ) returning id into v_plan_a1;

  insert into public.employee_compensation_plans (
    organization_id, employee_id, plan_code, name, status, created_by
  ) values (
    v_org_b, v_emp_b1, 'plan_b1', 'Plan principal B1', 'active', v_admin_b
  ) returning id into v_plan_b1;

  -- Unicité org+employé
  begin
    insert into public.employee_compensation_plans (
      organization_id, employee_id, plan_code, name
    ) values (v_org_a, v_emp_a1, 'plan_a1_dup', 'Dup');
    raise exception 'duplicate org+employee should fail';
  exception when unique_violation then null;
  end;

  -- Unicité plan_code org
  begin
    insert into public.employee_compensation_plans (
      organization_id, employee_id, plan_code, name
    ) values (v_org_a, v_emp_a2, 'plan_a1', 'Autre nom');
    raise exception 'duplicate plan_code should fail';
  exception when unique_violation then null;
  end;

  -- plan_code invalide
  begin
    insert into public.employee_compensation_plans (
      organization_id, employee_id, plan_code, name
    ) values (v_org_a, v_emp_a2, 'BAD-CODE', 'X');
    raise exception 'invalid plan_code should fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.employee_compensation_plans (
      organization_id, employee_id, plan_code, name
    ) values (v_org_a, v_emp_a2, '', 'X');
    raise exception 'empty plan_code should fail';
  exception when check_violation then null;
  end;

  -- name vide
  begin
    insert into public.employee_compensation_plans (
      organization_id, employee_id, plan_code, name
    ) values (v_org_a, v_emp_a2, 'plan_a2', '   ');
    raise exception 'blank name should fail';
  exception when check_violation then null;
  end;

  -- employé autre tenant
  begin
    insert into public.employee_compensation_plans (
      organization_id, employee_id, plan_code, name
    ) values (v_org_a, v_emp_b1, 'plan_x', 'Cross');
    raise exception 'cross-tenant employee should fail';
  exception when others then
    if sqlerrm not ilike '%cross-tenant%' then raise; end if;
  end;

  -- même logique employé dans org B (autre ligne chauffeurs)
  insert into public.employee_compensation_plans (
    organization_id, employee_id, plan_code, name
  ) values (
    v_org_b, v_emp_a1_in_b, 'plan_a1_b', 'Plan A1-like in B'
  );

  insert into public.employee_compensation_plans (
    organization_id, employee_id, plan_code, name
  ) values (
    v_org_a, v_emp_a2, 'plan_a2', 'Plan principal A2'
  ) returning id into v_plan_a2;

  -- organization_id immuable
  begin
    update public.employee_compensation_plans
    set organization_id = v_org_b where id = v_plan_a1;
    raise exception 'org mutation should fail';
  exception when others then
    if sqlerrm not ilike '%immuable%' then raise; end if;
  end;

  raise notice 'PLAN_OK';

  -- =========================================================================
  -- Versions: draft, workflow, chevauchements, résolution
  -- =========================================================================
  -- Draft avec date (effective_from NOT NULL — règle finale)
  insert into public.employee_compensation_plan_versions (
    organization_id, plan_id, version_number, status,
    effective_from, effective_to, created_by
  ) values (
    v_org_a, v_plan_a1, 1, 'draft', '2026-01-01', null, v_admin_a
  ) returning id into v_ver_a1_v1;

  -- version_number unique
  begin
    insert into public.employee_compensation_plan_versions (
      organization_id, plan_id, version_number, status, effective_from
    ) values (v_org_a, v_plan_a1, 1, 'draft', '2026-02-01');
    raise exception 'duplicate version_number should fail';
  exception when unique_violation then null;
  end;

  -- effective_to <= from refusée
  begin
    insert into public.employee_compensation_plan_versions (
      organization_id, plan_id, version_number, status, effective_from, effective_to
    ) values (v_org_a, v_plan_a1, 99, 'draft', '2026-06-01', '2026-06-01');
    raise exception 'equal effective_to should fail';
  exception when check_violation then null;
  end;

  -- règle sur draft
  insert into public.employee_compensation_plan_rules (
    organization_id, plan_version_id, category_id, commercial_origin,
    calculation_basis, calculation_method, rate_percent, display_order
  ) values (
    v_org_a, v_ver_a1_v1, v_cat_a_vis, null,
    'net_sales_ex_tax', 'percentage', 10, 0
  ) returning id into v_rule_id;

  -- catégorie masquée: SQL autorise (is_active) — couche métier filtre
  insert into public.employee_compensation_plan_rules (
    organization_id, plan_version_id, category_id, commercial_origin,
    calculation_basis, calculation_method, rate_percent, display_order
  ) values (
    v_org_a, v_ver_a1_v1, v_cat_a_hid, 'existing',
    'achieved_amount', 'percentage', 5, 1
  );

  -- catégorie inactive refusée
  begin
    insert into public.employee_compensation_plan_rules (
      organization_id, plan_version_id, category_id,
      calculation_basis, calculation_method, rate_percent
    ) values (
      v_org_a, v_ver_a1_v1, v_cat_a_inactive,
      'net_sales_ex_tax', 'percentage', 1
    );
    raise exception 'inactive category should fail';
  exception when others then
    if sqlerrm not ilike '%inactive%' then raise; end if;
  end;

  -- catégorie cross-tenant
  begin
    insert into public.employee_compensation_plan_rules (
      organization_id, plan_version_id, category_id,
      calculation_basis, calculation_method, rate_percent
    ) values (
      v_org_a, v_ver_a1_v1, v_cat_b,
      'net_sales_ex_tax', 'percentage', 1
    );
    raise exception 'cross-tenant category should fail';
  exception when others then
    if sqlerrm not ilike '%cross-tenant%' then raise; end if;
  end;

  -- méthodes
  insert into public.employee_compensation_plan_rules (
    organization_id, plan_version_id, category_id,
    calculation_basis, calculation_method, fixed_amount, currency_code, display_order
  ) values (
    v_org_a, v_ver_a1_v1, v_cat_a_vis,
    'achieved_amount', 'fixed_amount', 100, 'CAD', 2
  );

  insert into public.employee_compensation_plan_rules (
    organization_id, plan_version_id, category_id,
    calculation_basis, calculation_method, per_unit_amount, currency_code, display_order
  ) values (
    v_org_a, v_ver_a1_v1, v_cat_a_vis,
    'achieved_sales_count', 'per_unit', 25, 'CAD', 3
  );

  -- percentage + currency refusée
  begin
    insert into public.employee_compensation_plan_rules (
      organization_id, plan_version_id, category_id,
      calculation_basis, calculation_method, rate_percent, currency_code
    ) values (
      v_org_a, v_ver_a1_v1, v_cat_a_vis,
      'net_sales_ex_tax', 'percentage', 2, 'CAD'
    );
    raise exception 'percentage currency should fail';
  exception when check_violation then null;
  end;

  -- rate > 100
  begin
    insert into public.employee_compensation_plan_rules (
      organization_id, plan_version_id, category_id,
      calculation_basis, calculation_method, rate_percent
    ) values (
      v_org_a, v_ver_a1_v1, v_cat_a_vis,
      'net_sales_ex_tax', 'percentage', 101
    );
    raise exception 'rate>100 should fail';
  exception when check_violation then null;
  end;

  -- fixed sans devise
  begin
    insert into public.employee_compensation_plan_rules (
      organization_id, plan_version_id, category_id,
      calculation_basis, calculation_method, fixed_amount
    ) values (
      v_org_a, v_ver_a1_v1, v_cat_a_vis,
      'achieved_amount', 'fixed_amount', 10
    );
    raise exception 'fixed without currency should fail';
  exception when check_violation then null;
  end;

  -- montant négatif
  begin
    insert into public.employee_compensation_plan_rules (
      organization_id, plan_version_id, category_id,
      calculation_basis, calculation_method, fixed_amount, currency_code
    ) values (
      v_org_a, v_ver_a1_v1, v_cat_a_vis,
      'achieved_amount', 'fixed_amount', -1, 'CAD'
    );
    raise exception 'negative fixed should fail';
  exception when check_violation then null;
  end;

  -- min > max
  begin
    insert into public.employee_compensation_plan_rules (
      organization_id, plan_version_id, category_id,
      calculation_basis, calculation_method, rate_percent, min_amount, max_amount
    ) values (
      v_org_a, v_ver_a1_v1, v_cat_a_vis,
      'net_sales_ex_tax', 'percentage', 3, 100, 50
    );
    raise exception 'min>max should fail';
  exception when check_violation then null;
  end;

  -- base inconnue
  begin
    insert into public.employee_compensation_plan_rules (
      organization_id, plan_version_id, category_id,
      calculation_basis, calculation_method, rate_percent
    ) values (
      v_org_a, v_ver_a1_v1, v_cat_a_vis,
      'gross_before_tax', 'percentage', 1
    );
    raise exception 'unknown basis should fail';
  exception when check_violation then null;
  end;

  -- origines
  insert into public.employee_compensation_plan_rules (
    organization_id, plan_version_id, category_id, commercial_origin,
    calculation_basis, calculation_method, rate_percent, display_order
  ) values
    (v_org_a, v_ver_a1_v1, v_cat_a_vis, 'employee_developed',
     'net_sales_ex_tax', 'percentage', 8, 10),
    (v_org_a, v_ver_a1_v1, v_cat_a_vis, 'company_developed',
     'net_sales_ex_tax', 'percentage', 7, 11);

  begin
    insert into public.employee_compensation_plan_rules (
      organization_id, plan_version_id, category_id, commercial_origin,
      calculation_basis, calculation_method, rate_percent
    ) values (
      v_org_a, v_ver_a1_v1, v_cat_a_vis, 'unknown_origin',
      'net_sales_ex_tax', 'percentage', 1
    );
    raise exception 'unknown origin should fail';
  exception when check_violation then null;
  end;

  -- company_developed conservé (pas de rewrite)
  select commercial_origin into v_status
  from public.employee_compensation_plan_rules
  where plan_version_id = v_ver_a1_v1 and commercial_origin = 'company_developed'
  limit 1;
  if v_status is distinct from 'company_developed' then
    raise exception 'company_developed rewritten';
  end if;

  -- Publier draft → active
  update public.employee_compensation_plan_versions
  set status = 'active', published_by = v_admin_a
  where id = v_ver_a1_v1;

  update public.employee_compensation_plans
  set current_version_id = v_ver_a1_v1
  where id = v_plan_a1;

  -- Immutabilité contenu
  begin
    update public.employee_compensation_plan_versions
    set notes = 'hack' where id = v_ver_a1_v1;
    raise exception 'notes mutate should fail';
  exception when others then
    if sqlerrm not ilike '%immuable%' then raise; end if;
  end;

  begin
    update public.employee_compensation_plan_versions
    set effective_from = '2025-01-01' where id = v_ver_a1_v1;
    raise exception 'effective_from mutate should fail';
  exception when others then
    if sqlerrm not ilike '%immuable%' then raise; end if;
  end;

  -- Ajout règle sur version publiée
  begin
    insert into public.employee_compensation_plan_rules (
      organization_id, plan_version_id, category_id,
      calculation_basis, calculation_method, rate_percent
    ) values (
      v_org_a, v_ver_a1_v1, v_cat_a_vis,
      'net_sales_ex_tax', 'percentage', 1
    );
    raise exception 'rule insert on published should fail';
  exception when others then
    if sqlerrm not ilike '%figées%' and sqlerrm not ilike '%brouillon%' then raise; end if;
  end;

  -- Suppression règle publiée
  begin
    delete from public.employee_compensation_plan_rules where id = v_rule_id;
    raise exception 'rule delete on published should fail';
  exception when others then
    if sqlerrm not ilike '%refusée%' and sqlerrm not ilike '%brouillon%' then raise; end if;
  end;

  -- Transitions invalides
  begin
    update public.employee_compensation_plan_versions
    set status = 'draft' where id = v_ver_a1_v1;
    raise exception 'active→draft should fail';
  exception when others then
    if sqlerrm not ilike '%transition%' then raise; end if;
  end;

  -- Version future scheduled adjacente (to exclusif)
  -- v1 active [2026-01-01, infinity) — fermer avant nouvelle
  update public.employee_compensation_plan_versions
  set effective_to = '2026-07-01'
  where id = v_ver_a1_v1;

  insert into public.employee_compensation_plan_versions (
    organization_id, plan_id, version_number, status,
    effective_from, effective_to, created_by
  ) values (
    v_org_a, v_plan_a1, 2, 'draft', '2026-07-01', null, v_admin_a
  ) returning id into v_ver_a1_v2;

  -- Clonage logique: copier règles avec nouveaux ids
  insert into public.employee_compensation_plan_rules (
    organization_id, plan_version_id, category_id, commercial_origin,
    calculation_basis, calculation_method, rate_percent, display_order
  )
  select
    organization_id, v_ver_a1_v2, category_id, commercial_origin,
    calculation_basis, calculation_method, rate_percent, display_order
  from public.employee_compensation_plan_rules
  where plan_version_id = v_ver_a1_v1
    and calculation_method = 'percentage'
    and commercial_origin is null
  limit 1
  returning id into v_rule_clone;

  if v_rule_clone = v_rule_id then
    raise exception 'clone should have new rule id';
  end if;

  update public.employee_compensation_plan_versions
  set status = 'scheduled', published_by = v_admin_a
  where id = v_ver_a1_v2;

  -- Chevauchement refusé
  begin
    insert into public.employee_compensation_plan_versions (
      organization_id, plan_id, version_number, status,
      effective_from, effective_to
    ) values (
      v_org_a, v_plan_a1, 3, 'scheduled', '2026-06-01', '2026-08-01'
    );
    raise exception 'overlap should fail';
  exception when exclusion_violation then null;
  end;

  -- Non-chevauchant accepté puis cancelled (jamais applicable)
  insert into public.employee_compensation_plan_versions (
    organization_id, plan_id, version_number, status,
    effective_from, effective_to
  ) values (
    v_org_a, v_plan_a1, 3, 'draft', '2027-01-01', '2027-06-01'
  );
  update public.employee_compensation_plan_versions
  set status = 'cancelled'
  where plan_id = v_plan_a1 and version_number = 3;

  -- Résolution
  select plan_version_id, version_number, resolution_status
    into v_vid, v_vnum, v_status
  from public._bloc6d_resolve_version(v_plan_a1, '2026-03-15');
  if v_status <> 'resolved' or v_vid <> v_ver_a1_v1 then
    raise exception 'resolve current failed: % %', v_status, v_vid;
  end if;

  -- borne exclusive: 2026-07-01 → v2
  select plan_version_id, version_number, resolution_status
    into v_vid, v_vnum, v_status
  from public._bloc6d_resolve_version(v_plan_a1, '2026-07-01');
  if v_status <> 'resolved' or v_vid <> v_ver_a1_v2 then
    raise exception 'resolve exclusive boundary failed: % %', v_status, v_vid;
  end if;

  -- jour avant to exclusif encore v1
  select plan_version_id, resolution_status
    into v_vid, v_status
  from public._bloc6d_resolve_version(v_plan_a1, '2026-06-30');
  if v_vid <> v_ver_a1_v1 then
    raise exception 'resolve day before exclusive end failed';
  end if;

  -- future avant date: v2 scheduled applicable dès from (règle: scheduled applicable si date dans plage)
  select plan_version_id, resolution_status
    into v_vid, v_status
  from public._bloc6d_resolve_version(v_plan_a1, '2026-08-01');
  if v_vid <> v_ver_a1_v2 then
    raise exception 'resolve future scheduled failed';
  end if;

  -- cancelled jamais applicable (même si sa plage couvre la date)
  if exists (
    select 1
    from public._bloc6d_resolve_version(v_plan_a1, '2027-02-01') r
    join public.employee_compensation_plan_versions v on v.id = r.plan_version_id
    where v.status = 'cancelled'
  ) then
    raise exception 'cancelled should not apply';
  end if;

  -- aucune version applicable avant le début de l historique
  select resolution_status into v_status
  from public._bloc6d_resolve_version(v_plan_a1, '2025-06-01');
  if v_status <> 'missing_plan' then
    raise exception 'pre-history should be missing_plan: %', v_status;
  end if;

  -- Archiver v1 (déjà fermée) — transition active→archived
  update public.employee_compensation_plan_versions
  set status = 'archived'
  where id = v_ver_a1_v1;

  -- historique toujours résolvable
  select plan_version_id, resolution_status
    into v_vid, v_status
  from public._bloc6d_resolve_version(v_plan_a1, '2026-03-15');
  if v_vid <> v_ver_a1_v1 or v_status <> 'resolved' then
    raise exception 'historical archived resolve failed';
  end if;

  -- scheduled → active
  update public.employee_compensation_plan_versions
  set status = 'active'
  where id = v_ver_a1_v2;

  -- draft jamais applicable (nouvelle)
  insert into public.employee_compensation_plan_versions (
    organization_id, plan_id, version_number, status, effective_from
  ) values (
    v_org_a, v_plan_a1, 4, 'draft', '2028-01-01'
  ) returning id into v_ver_clone;

  if exists (
    select 1
    from public._bloc6d_resolve_version(v_plan_a1, '2028-02-01') r
    join public.employee_compensation_plan_versions v on v.id = r.plan_version_id
    where v.status = 'draft'
  ) then
    raise exception 'draft should not apply';
  end if;

  -- published_at/by null sur clone draft
  if exists (
    select 1 from public.employee_compensation_plan_versions
    where id = v_ver_clone and (published_at is not null or published_by is not null)
  ) then
    raise exception 'clone draft should have null published_*';
  end if;

  -- Modifier clone sans effet sur ancienne
  update public.employee_compensation_plan_versions
  set notes = 'clone notes' where id = v_ver_clone;
  if exists (
    select 1 from public.employee_compensation_plan_versions
    where id = v_ver_a1_v1 and notes = 'clone notes'
  ) then
    raise exception 'clone mutated old version';
  end if;

  -- Catégorie désactivée après publication: historique conserve règles
  update public.commission_categories set is_active = false where id = v_cat_a_vis;
  select count(*) into v_count
  from public.employee_compensation_plan_rules
  where plan_version_id = v_ver_a1_v1 and category_id = v_cat_a_vis;
  if v_count < 1 then
    raise exception 'deactivating category deleted historical rules';
  end if;

  -- nouvelle règle sur draft avec cat inactive refusée
  begin
    insert into public.employee_compensation_plan_rules (
      organization_id, plan_version_id, category_id,
      calculation_basis, calculation_method, rate_percent
    ) values (
      v_org_a, v_ver_clone, v_cat_a_vis,
      'net_sales_ex_tax', 'percentage', 1
    );
    raise exception 'inactive cat on new rule should fail';
  exception when others then
    if sqlerrm not ilike '%inactive%' then raise; end if;
  end;

  -- réactiver pour suite RLS
  update public.commission_categories set is_active = true where id = v_cat_a_vis;

  raise notice 'VERSIONS_RULES_OK';

  -- Index utiles
  select count(*) into v_idx_count
  from pg_indexes
  where schemaname = 'public'
    and tablename in (
      'employee_compensation_plans',
      'employee_compensation_plan_versions',
      'employee_compensation_plan_rules'
    );
  if v_idx_count < 5 then
    raise exception 'expected indexes missing: %', v_idx_count;
  end if;

  raise notice 'INDEX_OK count=%', v_idx_count;
end;
$$;

-- =========================================================================
-- RLS
-- =========================================================================
do $$
declare
  v_org_a text := 'oliem_solutions';
  v_org_b text := 'titan_produits_industriels';
  v_plan_a uuid;
  v_plan_b uuid;
  v_ver_a uuid;
  v_count int;
  v_emp_a1 bigint;
  v_emp_b1 bigint;
  v_cat_a uuid;
begin
  select id into v_plan_a from public.employee_compensation_plans
  where organization_id = v_org_a and plan_code = 'plan_a1';
  select id into v_plan_b from public.employee_compensation_plans
  where organization_id = v_org_b and plan_code = 'plan_b1';
  select id into v_ver_a from public.employee_compensation_plan_versions
  where plan_id = v_plan_a and version_number = 4;
  select id into v_emp_a1 from public.chauffeurs where nom = 'emp_a1';
  select id into v_emp_b1 from public.chauffeurs where nom = 'emp_b1';
  select id into v_cat_a from public.commission_categories
  where organization_id = v_org_a and code = 'cat_vis';

  -- Admin A
  perform public._bloc6d_set_claims('admin', v_org_a);
  set local role authenticated;

  select count(*) into v_count from public.employee_compensation_plans
  where organization_id = v_org_a;
  if v_count < 1 then raise exception 'Admin A cannot read A plans'; end if;

  select count(*) into v_count from public.employee_compensation_plans
  where organization_id = v_org_b;
  if v_count <> 0 then raise exception 'Admin A saw B plans'; end if;

  -- lecture / écriture A OK
  update public.employee_compensation_plans
  set name = 'Plan principal A1 (rls)'
  where id = v_plan_a;
  if not found then raise exception 'Admin A cannot update A plan'; end if;

  -- injection org B refusée (WITH CHECK RLS)
  begin
    insert into public.employee_compensation_plans (
      organization_id, employee_id, plan_code, name
    ) values (v_org_b, v_emp_b1, 'hack_b', 'Hack');
    raise exception 'Admin A inject org_b should fail RLS';
  exception when insufficient_privilege then null;
  when others then
    if sqlerrm ilike '%Admin A inject%' then raise; end if;
  end;

  reset role;
  perform public._bloc6d_clear_claims();

  -- Admin B
  perform public._bloc6d_set_claims('admin', v_org_b);
  set local role authenticated;

  select count(*) into v_count from public.employee_compensation_plans
  where organization_id = v_org_b;
  if v_count < 1 then raise exception 'Admin B cannot read B'; end if;

  select count(*) into v_count from public.employee_compensation_plans
  where organization_id = v_org_a;
  if v_count <> 0 then raise exception 'Admin B saw A'; end if;

  reset role;
  perform public._bloc6d_clear_claims();

  -- Direction A + commissions
  perform public._bloc6d_set_claims('direction', v_org_a, array['commissions']);
  set local role authenticated;

  select count(*) into v_count from public.employee_compensation_plans
  where organization_id = v_org_a;
  if v_count < 1 then raise exception 'Direction+commissions cannot read A'; end if;

  select count(*) into v_count from public.employee_compensation_plans
  where organization_id = v_org_b;
  if v_count <> 0 then raise exception 'Direction saw B'; end if;

  begin
    update public.employee_compensation_plans set name = 'hack'
    where id = v_plan_a;
    if found then raise exception 'Direction write should fail'; end if;
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform public._bloc6d_clear_claims();

  -- Direction sans permission
  perform public._bloc6d_set_claims('direction', v_org_a, '{}'::text[]);
  set local role authenticated;

  select count(*) into v_count from public.employee_compensation_plans;
  if v_count <> 0 then raise exception 'Direction without perm saw plans'; end if;

  reset role;
  perform public._bloc6d_clear_claims();

  -- Employé
  perform public._bloc6d_set_claims('employe', v_org_a);
  set local role authenticated;

  select count(*) into v_count from public.employee_compensation_plans;
  if v_count <> 0 then raise exception 'Employe saw plans'; end if;

  reset role;
  perform public._bloc6d_clear_claims();

  -- Anonyme
  set local role anon;
  begin
    select count(*) into v_count from public.employee_compensation_plans;
    if v_count <> 0 then raise exception 'anon saw plans'; end if;
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Authenticated sans org
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'admin')
    )::text,
    true
  );
  set local role authenticated;
  select count(*) into v_count from public.employee_compensation_plans;
  if v_count <> 0 then raise exception 'admin without org saw plans'; end if;
  reset role;
  perform public._bloc6d_clear_claims();

  raise notice 'RLS_OK';
end;
$$;

-- Nettoyage jetable final
do $$
declare
  v_org_a text := 'oliem_solutions';
  v_org_b text := 'titan_produits_industriels';
  v_admin_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_admin_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_dir_a uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
begin
  set local session_replication_role = replica;
  delete from public.employee_compensation_plan_rules
  where organization_id in (v_org_a, v_org_b);
  delete from public.employee_compensation_plan_versions
  where organization_id in (v_org_a, v_org_b);
  update public.employee_compensation_plans set current_version_id = null
  where organization_id in (v_org_a, v_org_b);
  delete from public.employee_compensation_plans
  where organization_id in (v_org_a, v_org_b);
  set local session_replication_role = origin;
  delete from public.commission_categories
  where organization_id in (v_org_a, v_org_b);
  delete from public.chauffeurs
  where nom in ('emp_a1', 'emp_a2', 'emp_b1', 'emp_a1_in_b');

  delete from auth.users
  where id in (
    v_admin_a,
    v_admin_b,
    v_dir_a
  );

  if exists (
    select 1
    from auth.users
    where id in (
      v_admin_a,
      v_admin_b,
      v_dir_a
    )
  ) then
    raise exception 'BLOC 6D cleanup Auth incomplet';
  end if;

  raise notice 'CLEANUP_OK';
end;
$$;

select 'BLOC_6D_PHASE2_SQL_PASS' as result;
