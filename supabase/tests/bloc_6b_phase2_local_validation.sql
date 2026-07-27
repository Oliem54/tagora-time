-- Bloc 6B Phase 2 — validation locale SQL / RLS / seed (jetable).
-- Prérequis: bootstrap helpers + migration 6B déjà appliqués.
-- Ne pas exécuter sur staging ni production.

\set ON_ERROR_STOP on

do $$
declare
  v_count int;
  v_label text;
  v_ok boolean;
  v_err text;
  v_admin_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_admin_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_dir_a uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_dir_np uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  v_emp_a uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  v_seen int;
begin
  -- Nettoyage jetable
  delete from public.commission_categories
  where organization_id in ('org_a', 'org_b', 'org_custom_only', 'org_empty_probe');
  delete from public.commission_organization_settings
  where organization_id in ('org_a', 'org_b', 'org_custom_only', 'org_empty_probe');

  -- =========================================================================
  -- SEED première exécution org_a
  -- =========================================================================
  perform public.ensure_commission_organization_foundation('org_a');

  select count(*) into v_count
  from public.commission_categories where organization_id = 'org_a';
  if v_count <> 7 then
    raise exception 'SEED1 categories count=% expected 7', v_count;
  end if;

  select count(*) into v_count
  from public.commission_organization_settings where organization_id = 'org_a';
  if v_count <> 1 then
    raise exception 'SEED1 settings count=% expected 1', v_count;
  end if;

  -- Personnalisations
  update public.commission_categories
  set label = 'Autos perso A'
  where organization_id = 'org_a' and code = 'vehicles';

  insert into public.commission_categories (
    organization_id, code, label, display_order, is_visible, is_active, is_system_default
  ) values (
    'org_a', 'custom_kit', 'Kit personnalisé', 90, true, true, false
  );

  -- =========================================================================
  -- SEED seconde exécution — pas de doublon / pas d écrasement
  -- =========================================================================
  perform public.ensure_commission_organization_foundation('org_a');

  select count(*) into v_count
  from public.commission_categories where organization_id = 'org_a';
  if v_count <> 8 then
    raise exception 'SEED2 categories count=% expected 8', v_count;
  end if;

  select label into v_label
  from public.commission_categories
  where organization_id = 'org_a' and code = 'vehicles';
  if v_label <> 'Autos perso A' then
    raise exception 'SEED2 overwritten vehicles label=%', v_label;
  end if;

  select count(*) into v_count
  from public.commission_categories
  where organization_id = 'org_a' and code = 'custom_kit';
  if v_count <> 1 then
    raise exception 'SEED2 custom category lost';
  end if;

  -- =========================================================================
  -- Deux organisations + même code
  -- =========================================================================
  perform public.ensure_commission_organization_foundation('org_b');

  select count(*) into v_count
  from public.commission_categories where organization_id = 'org_b';
  if v_count <> 7 then
    raise exception 'ORG_B categories count=%', v_count;
  end if;

  select count(*) into v_count
  from public.commission_categories
  where code = 'vehicles' and organization_id in ('org_a', 'org_b');
  if v_count <> 2 then
    raise exception 'same code across orgs failed count=%', v_count;
  end if;

  begin
    insert into public.commission_categories (
      organization_id, code, label, display_order
    ) values ('org_a', 'vehicles', 'Dup', 1);
    raise exception 'duplicate code same org should fail';
  exception
    when unique_violation then
      null;
  end;

  -- Contraintes
  begin
    insert into public.commission_categories (
      organization_id, code, label, display_order
    ) values ('org_a', 'bad_label', '   ', 1);
    raise exception 'empty label should fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.commission_categories (
      organization_id, code, label, display_order
    ) values ('org_a', 'BAD CODE', 'X', 1);
    raise exception 'invalid code should fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.commission_categories (
      organization_id, code, label, display_order
    ) values ('org_a', 'neg_order', 'X', -1);
    raise exception 'negative display_order should fail';
  exception when check_violation then null;
  end;

  -- Masqué / inactif distincts — lignes conservées
  update public.commission_categories
  set is_visible = false, is_active = true
  where organization_id = 'org_a' and code = 'parts';

  update public.commission_categories
  set is_visible = true, is_active = false
  where organization_id = 'org_a' and code = 'service';

  select count(*) into v_count
  from public.commission_categories
  where organization_id = 'org_a' and code in ('parts', 'service');
  if v_count <> 2 then
    raise exception 'masked/inactive rows deleted unexpectedly';
  end if;

  -- Paramètres
  update public.commission_organization_settings
  set
    currency_code = 'USD',
    default_warranty_eligible = false,
    rounding_precision = 2,
    rounding_mode = 'half_up',
    default_completion_trigger = 'sale_completed',
    simple_commission_plans_enabled = true
  where organization_id = 'org_a';

  begin
    update public.commission_organization_settings
    set currency_code = 'US'
    where organization_id = 'org_a';
    raise exception 'invalid currency should fail';
  exception when check_violation then null;
  end;

  update public.commission_organization_settings
  set currency_code = 'EUR', simple_commission_plans_enabled = false
  where organization_id = 'org_a';

  select count(*) into v_count
  from public.commission_organization_settings where organization_id = 'org_a';
  if v_count <> 1 then
    raise exception 'settings not singleton';
  end if;

  -- Org sans chauffeur ni objectif: non découverte automatiquement
  select count(*) into v_count
  from public.commission_organization_settings
  where organization_id = 'org_empty_probe';
  if v_count <> 0 then
    raise exception 'empty org should not auto-exist';
  end if;
  perform public.ensure_commission_organization_foundation('org_empty_probe');
  select count(*) into v_count
  from public.commission_categories where organization_id = 'org_empty_probe';
  if v_count <> 7 then
    raise exception 'explicit foundation for empty org failed';
  end if;

  -- Index présents
  if to_regclass('public.idx_commission_categories_org_order') is null then
    raise exception 'missing index org_order';
  end if;
  if to_regclass('public.idx_commission_categories_org_active') is null then
    raise exception 'missing index org_active';
  end if;

  -- Legacy tables still present (si créées dans bootstrap)
  if to_regclass('public.sales_objectives') is null then
    raise exception 'sales_objectives missing';
  end if;

  raise notice 'STRUCT_AND_SEED_OK';
end;
$$;

-- ===========================================================================
-- RLS
-- ===========================================================================

create or replace function public._bloc6b_set_claims(
  p_role text,
  p_org text,
  p_permissions text[] default '{}'::text[],
  p_sub uuid default '11111111-1111-1111-1111-111111111111'
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

grant select, insert, update, delete on public.commission_categories to authenticated;
grant select, insert, update, delete on public.commission_organization_settings to authenticated;
grant execute on function public.current_user_organization_ids() to authenticated;
grant execute on function public.user_can_access_commission_organization(text) to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.is_direction_user() to authenticated;
grant execute on function public.has_app_permission(text) to authenticated;
grant execute on function public.current_app_permissions() to authenticated;
grant execute on function public._bloc6b_set_claims(text, text, text[], uuid) to authenticated;
grant execute on function auth.jwt() to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

do $$
declare
  v_count int;
  v_id uuid;
begin
  -- Admin A: lit/écrit A, pas B
  perform set_config('role', 'authenticated', true);
  perform public._bloc6b_set_claims('admin', 'org_a', '{}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  select count(*) into v_count from public.commission_categories where organization_id = 'org_a';
  if v_count < 7 then
    raise exception 'ADMIN_A cannot read A count=%', v_count;
  end if;

  select count(*) into v_count from public.commission_categories where organization_id = 'org_b';
  if v_count <> 0 then
    raise exception 'ADMIN_A leaked B count=%', v_count;
  end if;

  insert into public.commission_categories (
    organization_id, code, label, display_order
  ) values ('org_a', 'admin_created', 'Créée Admin A', 95)
  returning id into v_id;

  begin
    insert into public.commission_categories (
      organization_id, code, label, display_order
    ) values ('org_b', 'inject_b', 'Injection', 1);
    raise exception 'ADMIN_A injected into B';
  exception
    when insufficient_privilege then null;
    when check_violation then null;
    when others then
      if sqlerrm like '%ADMIN_A injected%' then
        raise;
      end if;
      -- Postgres RLS WITH CHECK failure: "new row violates row-level security policy"
      if sqlerrm ilike '%row-level security%' then
        null;
      else
        raise;
      end if;
  end;

  -- Verify inject did not land
  perform set_config('role', 'postgres', true);
  select count(*) into v_count
  from public.commission_categories
  where organization_id = 'org_b' and code = 'inject_b';
  if v_count <> 0 then
    raise exception 'ADMIN_A inject_b persisted';
  end if;

  -- Direction A with commissions: read A, no write, no B
  perform set_config('role', 'authenticated', true);
  perform public._bloc6b_set_claims(
    'direction', 'org_a', array['commissions'], 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  );

  select count(*) into v_count from public.commission_categories where organization_id = 'org_a';
  if v_count < 7 then
    raise exception 'DIR_A cannot read A';
  end if;

  select count(*) into v_count from public.commission_categories where organization_id = 'org_b';
  if v_count <> 0 then
    raise exception 'DIR_A leaked B';
  end if;

  begin
    update public.commission_categories
    set label = 'hack'
    where organization_id = 'org_a' and code = 'batteries';
    -- if RLS blocks, 0 rows updated without error on UPDATE
  end;
  perform set_config('role', 'postgres', true);
  if exists (
    select 1 from public.commission_categories
    where organization_id = 'org_a' and code = 'batteries' and label = 'hack'
  ) then
    raise exception 'DIR_A modified A';
  end if;

  -- Direction without permission
  perform set_config('role', 'authenticated', true);
  perform public._bloc6b_set_claims(
    'direction', 'org_a', '{}', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  );
  select count(*) into v_count from public.commission_categories where organization_id = 'org_a';
  if v_count <> 0 then
    raise exception 'DIR_NO_PERM read A count=%', v_count;
  end if;

  -- Employé: aucune lecture config
  perform public._bloc6b_set_claims(
    'employe', 'org_a', array['commissions'], 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  );
  select count(*) into v_count from public.commission_categories where organization_id = 'org_a';
  if v_count <> 0 then
    raise exception 'EMPLOYE read config count=%', v_count;
  end if;

  -- Authenticated sans organisation
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', '99999999-9999-9999-9999-999999999999',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'admin')
    )::text,
    true
  );
  select count(*) into v_count from public.commission_categories;
  if v_count <> 0 then
    raise exception 'ADMIN_NO_ORG read count=%', v_count;
  end if;

  -- Anonyme
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
  begin
    select count(*) into v_count from public.commission_categories;
    if v_count <> 0 then
      raise exception 'ANON read count=%', v_count;
    end if;
  exception
    when insufficient_privilege then
      null; -- expected if grants absent for anon
  end;

  perform set_config('role', 'postgres', true);
  raise notice 'RLS_OK';
end;
$$;

-- Résumé
select 'PASS_BLOC_6B_PHASE2_SQL' as status;
