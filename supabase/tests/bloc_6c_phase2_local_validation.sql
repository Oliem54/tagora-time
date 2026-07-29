-- Bloc 6C Phase 2 — validation locale SQL / RLS / transferts / snapshots.
-- Prérequis: bootstrap + migration 6C appliqués.
-- Ne pas exécuter sur staging ni production.

\set ON_ERROR_STOP on

create or replace function public._bloc6c_set_claims(
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

grant select, insert, update, delete on public.commercial_parties to authenticated;
grant select, insert, update, delete on public.commercial_origin_profiles to authenticated;
grant select, insert, update, delete on public.commercial_origin_transfers to authenticated;
grant select, insert, update, delete on public.sale_commercial_origin_snapshots to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public._bloc6c_set_claims(text, text, text[], uuid) to authenticated;
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
  v_party_a uuid;
  v_party_b uuid;
  v_profile_a uuid;
  v_transfer_id uuid;
  v_snap_id uuid;
  v_count int;
  v_origin text;
  v_dev bigint;
  v_status text;
  v_admin_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_admin_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
begin
  -- Nettoyage jetable
  delete from public.sale_commercial_origin_snapshots
  where organization_id in (v_org_a, v_org_b);
  delete from public.commercial_origin_transfers
  where organization_id in (v_org_a, v_org_b);
  delete from public.commercial_origin_profiles
  where organization_id in (v_org_a, v_org_b);
  delete from public.commercial_parties
  where organization_id in (v_org_a, v_org_b);
  delete from public.chauffeurs
  where nom in ('emp_a1', 'emp_a2', 'emp_b1');

  select coalesce(max(id), 0) + 1000
  into v_emp_a1
  from public.chauffeurs;

  v_emp_a2 := v_emp_a1 + 1;

  v_emp_b1 := v_emp_a1 + 2;

  insert into public.chauffeurs (id, primary_company, nom)
  values (v_emp_a1, v_org_a, 'emp_a1');

  insert into public.chauffeurs (id, primary_company, nom)
  values (v_emp_a2, v_org_a, 'emp_a2');

  insert into public.chauffeurs (id, primary_company, nom)
  values (v_emp_b1, v_org_b, 'emp_b1');

  -- =========================================================================
  -- organization_id convention
  -- =========================================================================
  begin
    insert into public.commercial_parties (organization_id, party_type, label)
    values ('Org_Bad', 'client', 'X');
    raise exception 'mixed case org should fail CHECK';
  exception when check_violation then null;
  end;

  begin
    insert into public.commercial_parties (organization_id, party_type, label)
    values ('org-bad', 'client', 'X');
    raise exception 'hyphen org should fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.commercial_parties (organization_id, party_type, label)
    values ('org bad', 'client', 'X');
    raise exception 'space org should fail';
  exception when check_violation then null;
  end;

  insert into public.commercial_parties (organization_id, party_type, label, external_key)
  values (v_org_a, 'client', 'Client A', 'ext-a')
  returning id into v_party_a;

  insert into public.commercial_parties (organization_id, party_type, label, external_key)
  values (v_org_b, 'client', 'Client B', 'ext-b')
  returning id into v_party_b;

  update public.commercial_parties set label = 'Client A renommé' where id = v_party_a;
  begin
    update public.commercial_parties set organization_id = v_org_b where id = v_party_a;
    raise exception 'org_id mutation should fail';
  exception when others then
    if sqlerrm not ilike '%immuable%' then raise; end if;
  end;

  -- =========================================================================
  -- Profils
  -- =========================================================================
  insert into public.commercial_origin_profiles (
    organization_id, entity_type, entity_id, commercial_origin,
    developed_by_employee_id, effective_from, status
  ) values (
    v_org_a, 'client', v_party_a, 'existing', null, '2026-01-01', 'active'
  ) returning id into v_profile_a;

  begin
    insert into public.commercial_origin_profiles (
      organization_id, entity_type, entity_id, commercial_origin,
      developed_by_employee_id, effective_from, status
    ) values (
      v_org_a, 'client', v_party_a, 'employee_developed', null, '2026-02-01', 'active'
    );
    raise exception 'employee_developed without developer should fail';
  exception when check_violation then null;
  end;

  -- Close previous open profile before new active open profile (unique index)
  update public.commercial_origin_profiles
  set effective_to = '2026-05-31', status = 'inactive'
  where id = v_profile_a;

  insert into public.commercial_origin_profiles (
    organization_id, entity_type, entity_id, commercial_origin,
    developed_by_employee_id, effective_from, status
  ) values (
    v_org_a, 'client', v_party_a, 'employee_developed', v_emp_a1, '2026-06-01', 'active'
  ) returning id into v_profile_a;

  begin
    insert into public.commercial_origin_profiles (
      organization_id, entity_type, entity_id, commercial_origin,
      developed_by_employee_id, effective_from, status
    ) values (
      v_org_a, 'client', v_party_a, 'employee_developed', v_emp_b1, '2026-07-01', 'active'
    );
    raise exception 'cross-tenant developer should fail';
  exception when others then
    if sqlerrm not ilike '%cross-tenant%' then raise; end if;
  end;

  insert into public.commercial_origin_profiles (
    organization_id, entity_type, entity_id, commercial_origin,
    developed_by_employee_id, effective_from, effective_to, status
  ) values (
    v_org_b, 'client', v_party_b, 'company_developed', null, '2026-01-01', null, 'active'
  );

  begin
    insert into public.commercial_origin_profiles (
      organization_id, entity_type, entity_id, commercial_origin,
      developed_by_employee_id, effective_from, effective_to, status
    ) values (
      v_org_a, 'client', v_party_a, 'existing', null, '2026-08-01', '2026-07-01', 'active'
    );
    raise exception 'inverted period should fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.commercial_origin_profiles (
      organization_id, entity_type, entity_id, commercial_origin,
      developed_by_employee_id, effective_from, status
    ) values (
      v_org_a, 'client', v_party_a, 'existing', null, '2026-09-01', 'active'
    );
    raise exception 'second open active profile should fail unique';
  exception when unique_violation then null;
  end;

  -- =========================================================================
  -- Transferts
  -- =========================================================================
  insert into public.commercial_origin_transfers (
    organization_id, entity_type, entity_id,
    from_employee_id, to_employee_id, effective_at, reason, created_by
  ) values (
    v_org_a, 'client', v_party_a, v_emp_a1, v_emp_a2, '2026-07-01',
    'Réaffectation interne', null
  ) returning id into v_transfer_id;

  begin
    insert into public.commercial_origin_transfers (
      organization_id, entity_type, entity_id,
      from_employee_id, to_employee_id, effective_at
    ) values (
      v_org_a, 'client', v_party_a, v_emp_a1, v_emp_a1, '2026-08-01'
    );
    raise exception 'same from/to should fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.commercial_origin_transfers (
      organization_id, entity_type, entity_id,
      from_employee_id, to_employee_id, effective_at
    ) values (
      v_org_a, 'client', v_party_a, v_emp_a1, v_emp_b1, '2026-08-01'
    );
    raise exception 'B1 on party A should fail';
  exception when others then
    if sqlerrm not ilike '%cross-tenant%' then raise; end if;
  end;

  select count(*) into v_count from public.commercial_origin_transfers where id = v_transfer_id;
  if v_count <> 1 then raise exception 'transfer history lost'; end if;

  -- =========================================================================
  -- Snapshots
  -- =========================================================================
  -- Vente antérieure au transfert: développeur A1 (simulé via insert snapshot)
  insert into public.sale_commercial_origin_snapshots (
    organization_id, sale_id, commercial_origin_snapshot,
    developed_by_employee_id_snapshot, source_profile_id,
    review_status, captured_by_system
  ) values (
    v_org_a, 'sale-past', 'employee_developed', v_emp_a1, v_profile_a,
    'confirmed', true
  ) returning id into v_snap_id;

  -- Même sale_id dans org B OK
  insert into public.sale_commercial_origin_snapshots (
    organization_id, sale_id, commercial_origin_snapshot,
    developed_by_employee_id_snapshot, review_status
  ) values (
    v_org_b, 'sale-past', 'company_developed', null, 'confirmed'
  );

  begin
    insert into public.sale_commercial_origin_snapshots (
      organization_id, sale_id, commercial_origin_snapshot, review_status
    ) values (v_org_a, 'sale-past', 'existing', 'confirmed');
    raise exception 'duplicate org+sale should fail';
  exception when unique_violation then null;
  end;

  -- Immutabilité confirmed
  begin
    update public.sale_commercial_origin_snapshots
    set developed_by_employee_id_snapshot = v_emp_a2
    where id = v_snap_id;
    raise exception 'confirmed snapshot mutate should fail';
  exception when others then
    if sqlerrm not ilike '%immuable%' then raise; end if;
  end;

  -- pending_review → resolved autorisé
  insert into public.sale_commercial_origin_snapshots (
    organization_id, sale_id, commercial_origin_snapshot,
    developed_by_employee_id_snapshot, review_status
  ) values (
    v_org_a, 'sale-pending', null, null, 'pending_review'
  ) returning id into v_snap_id;

  update public.sale_commercial_origin_snapshots
  set
    review_status = 'resolved',
    commercial_origin_snapshot = 'employee_developed',
    developed_by_employee_id_snapshot = v_emp_a2,
    confirmed_by = null,
    confirmed_at = timezone('utc', now()),
    confirmation_reason = 'Confirmé après vérification'
  where id = v_snap_id;

  select review_status, commercial_origin_snapshot, developed_by_employee_id_snapshot
    into v_status, v_origin, v_dev
  from public.sale_commercial_origin_snapshots where id = v_snap_id;

  if v_status <> 'resolved' or v_origin <> 'employee_developed' or v_dev <> v_emp_a2 then
    raise exception 'pending→resolved failed';
  end if;

  begin
    update public.sale_commercial_origin_snapshots
    set commercial_origin_snapshot = 'existing'
    where id = v_snap_id;
    raise exception 'resolved snapshot mutate should fail';
  exception when others then
    if sqlerrm not ilike '%immuable%' then raise; end if;
  end;

  -- company_developed conservé
  select commercial_origin_snapshot into v_origin
  from public.sale_commercial_origin_snapshots
  where organization_id = v_org_b and sale_id = 'sale-past';
  if v_origin <> 'company_developed' then
    raise exception 'company_developed not preserved';
  end if;

  -- Index présents
  if to_regclass('public.idx_commercial_parties_org_external_key') is null
    or to_regclass('public.idx_commercial_origin_profiles_entity') is null
    or to_regclass('public.idx_commercial_origin_transfers_entity_effective') is null
    or to_regclass('public.idx_sale_origin_snapshots_review') is null
  then
    raise exception 'missing expected indexes';
  end if;

  raise notice 'STRUCT_TRANSFERS_SNAPSHOTS_OK emp_a1=% emp_a2=% emp_b1=% party_a=%',
    v_emp_a1, v_emp_a2, v_emp_b1, v_party_a;
end;
$$;

-- ===========================================================================
-- RLS
-- ===========================================================================
do $$
declare
  v_org_a text := 'oliem_solutions';
  v_org_b text := 'titan_produits_industriels';
  v_count int;
  v_party_a uuid;
  v_party_b uuid;
  v_snap_b uuid;
begin
  select id into v_party_a from public.commercial_parties where organization_id = v_org_a limit 1;
  select id into v_party_b from public.commercial_parties where organization_id = v_org_b limit 1;
  select id into v_snap_b from public.sale_commercial_origin_snapshots
  where organization_id = v_org_b and sale_id = 'sale-past';

  -- Admin A
  perform set_config('role', 'authenticated', true);
  perform public._bloc6c_set_claims('admin', v_org_a, '{}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  select count(*) into v_count from public.commercial_parties where organization_id = v_org_a;
  if v_count < 1 then raise exception 'ADMIN_A cannot read parties A'; end if;

  select count(*) into v_count from public.commercial_parties where organization_id = v_org_b;
  if v_count <> 0 then raise exception 'ADMIN_A leaked parties B'; end if;

  begin
    insert into public.commercial_parties (organization_id, party_type, label)
    values (v_org_b, 'client', 'Inject');
    raise exception 'ADMIN_A injected B';
  exception when others then
    if sqlerrm like '%ADMIN_A injected%' then raise; end if;
  end;

  -- Resolve pending in A (already resolved above as postgres — create another)
  perform set_config('role', 'postgres', true);
  insert into public.sale_commercial_origin_snapshots (
    organization_id, sale_id, review_status
  ) values (v_org_a, 'sale-rls-pending', 'pending_review');

  perform set_config('role', 'authenticated', true);
  perform public._bloc6c_set_claims('admin', v_org_a, '{}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  update public.sale_commercial_origin_snapshots
  set
    review_status = 'resolved',
    commercial_origin_snapshot = 'existing',
    confirmed_by = null,
    confirmed_at = timezone('utc', now()),
    confirmation_reason = 'RLS ok'
  where organization_id = v_org_a and sale_id = 'sale-rls-pending';

  -- Cannot resolve B
  begin
    update public.sale_commercial_origin_snapshots
    set confirmation_reason = 'hack'
    where id = v_snap_b;
  exception when others then null;
  end;
  perform set_config('role', 'postgres', true);
  if exists (
    select 1 from public.sale_commercial_origin_snapshots
    where id = v_snap_b and confirmation_reason = 'hack'
  ) then
    raise exception 'ADMIN_A modified snapshot B';
  end if;

  -- Admin B reads B only
  perform set_config('role', 'authenticated', true);
  perform public._bloc6c_set_claims('admin', v_org_b, '{}', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  select count(*) into v_count from public.commercial_parties where organization_id = v_org_b;
  if v_count < 1 then raise exception 'ADMIN_B cannot read B'; end if;
  select count(*) into v_count from public.commercial_parties where organization_id = v_org_a;
  if v_count <> 0 then raise exception 'ADMIN_B leaked A'; end if;

  -- Direction A + commissions: read, no write
  perform public._bloc6c_set_claims(
    'direction', v_org_a, array['commissions'], 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  );
  select count(*) into v_count from public.commercial_parties where organization_id = v_org_a;
  if v_count < 1 then raise exception 'DIR_A cannot read A'; end if;
  select count(*) into v_count from public.commercial_parties where organization_id = v_org_b;
  if v_count <> 0 then raise exception 'DIR_A leaked B'; end if;

  update public.commercial_parties set label = 'hack-dir' where organization_id = v_org_a;
  perform set_config('role', 'postgres', true);
  if exists (select 1 from public.commercial_parties where organization_id = v_org_a and label = 'hack-dir') then
    raise exception 'DIR_A wrote A';
  end if;

  -- Direction without permission
  perform set_config('role', 'authenticated', true);
  perform public._bloc6c_set_claims('direction', v_org_a, '{}', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  select count(*) into v_count from public.commercial_parties;
  if v_count <> 0 then raise exception 'DIR_NO_PERM read count=%', v_count; end if;

  -- Employé
  perform public._bloc6c_set_claims('employe', v_org_a, array['commissions'], 'ffffffff-ffff-ffff-ffff-ffffffffffff');
  select count(*) into v_count from public.commercial_parties;
  if v_count <> 0 then raise exception 'EMPLOYE read config'; end if;

  -- Sans organisation
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', '99999999-9999-9999-9999-999999999999',
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'admin')
    )::text,
    true
  );
  select count(*) into v_count from public.commercial_parties;
  if v_count <> 0 then raise exception 'ADMIN_NO_ORG read'; end if;

  -- Anonyme
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
  begin
    select count(*) into v_count from public.commercial_parties;
    if v_count <> 0 then raise exception 'ANON read'; end if;
  exception when insufficient_privilege then null;
  end;

  perform set_config('role', 'postgres', true);
  raise notice 'RLS_OK';
end;
$$;

-- Nettoyage final autonome : laisser la base compatible avec 6D immédiat
do $$
declare
  v_org_a text := 'oliem_solutions';
  v_org_b text := 'titan_produits_industriels';
  v_remaining integer;
begin
  delete from public.sale_commercial_origin_snapshots
  where organization_id in (v_org_a, v_org_b)
    and sale_id in (
      'sale-past',
      'sale-pending',
      'sale-rls-pending'
    );

  delete from public.commercial_origin_transfers
  where organization_id in (v_org_a, v_org_b)
    and entity_id in (
      select id
      from public.commercial_parties
      where organization_id in (v_org_a, v_org_b)
        and (
          external_key in ('ext-a', 'ext-b')
          or label in ('Client A', 'Client A renommé', 'Client B', 'Inject')
        )
    );

  delete from public.commercial_origin_profiles
  where organization_id in (v_org_a, v_org_b)
    and entity_id in (
      select id
      from public.commercial_parties
      where organization_id in (v_org_a, v_org_b)
        and (
          external_key in ('ext-a', 'ext-b')
          or label in ('Client A', 'Client A renommé', 'Client B', 'Inject')
        )
    );

  delete from public.commercial_parties
  where organization_id in (v_org_a, v_org_b)
    and (
      external_key in ('ext-a', 'ext-b')
      or label in ('Client A', 'Client A renommé', 'Client B', 'Inject')
    );

  delete from public.chauffeurs
  where nom in ('emp_a1', 'emp_a2', 'emp_b1');

  select
    (
      select count(*)
      from public.sale_commercial_origin_snapshots
      where organization_id in (v_org_a, v_org_b)
        and sale_id in ('sale-past', 'sale-pending', 'sale-rls-pending')
    )
    +
    (
      select count(*)
      from public.commercial_parties
      where organization_id in (v_org_a, v_org_b)
        and (
          external_key in ('ext-a', 'ext-b')
          or label in ('Client A', 'Client A renommé', 'Client B', 'Inject')
        )
    )
    +
    (
      select count(*)
      from public.chauffeurs
      where nom in ('emp_a1', 'emp_a2', 'emp_b1')
    )
  into v_remaining;

  if v_remaining <> 0 then
    raise exception 'BLOC 6C cleanup incomplet: % résidu(s)', v_remaining;
  end if;

  raise notice 'BLOC_6C_CLEANUP_OK';
end;
$$;

select 'PASS_BLOC_6C_PHASE2_SQL' as status;
