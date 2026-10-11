-- STATUS: LOCAL PROPOSAL ONLY
-- DO NOT APPLY without a separate explicit Martin GO.
-- This file is not applied by the current change.
--
-- One Postgres transaction: organization_memberships.role and
-- public.user_role_audit_logs commit together, or neither does.
-- auth.users app_metadata.role is outside this function and is not atomic with it.
--
-- The caller is the HORORA service role. The human actor is re-read from
-- organization_memberships. auth.uid() is not the actor.

create or replace function public.commit_horora_membership_role_with_audit(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_target_user_id uuid,
  p_new_role text,
  p_is_default boolean,
  p_target_employee_id bigint,
  p_changed_by_email text,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_actor_role text;
  v_target_id uuid;
  v_target_role text;
  v_target_status text;
  v_other_org uuid;
  v_app_role text;
  v_user_role text;
  v_audit_id bigint;
  v_updated integer;
  v_previous text;
  v_action text;
begin
  if p_actor_user_id is null
     or p_organization_id is null
     or p_target_user_id is null
     or p_new_role is null then
    raise exception 'session_unreliable'
      using errcode = 'check_violation';
  end if;

  if p_new_role is distinct from 'employe'
     and p_new_role is distinct from 'direction' then
    raise exception 'unauthorized_membership_role'
      using errcode = 'check_violation';
  end if;

  if p_actor_user_id = p_target_user_id then
    raise exception 'self_role_change_forbidden'
      using errcode = 'check_violation';
  end if;

  select m.role
    into v_actor_role
  from public.organization_memberships m
  where m.user_id = p_actor_user_id
    and m.organization_id = p_organization_id
    and m.status = 'active'
  for update;

  if v_actor_role is null
     or v_actor_role not in ('organization_owner', 'organization_admin', 'direction') then
    raise exception 'actor_forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  perform 1
  from public.organization_memberships m
  where m.user_id = p_target_user_id
  for update;

  select m.organization_id
    into v_other_org
  from public.organization_memberships m
  where m.user_id = p_target_user_id
    and m.organization_id is distinct from p_organization_id
  limit 1;

  if v_other_org is not null then
    raise exception 'cross_tenant_conflict'
      using errcode = 'check_violation';
  end if;

  select m.id, m.role, m.status
    into v_target_id, v_target_role, v_target_status
  from public.organization_memberships m
  where m.user_id = p_target_user_id
    and m.organization_id = p_organization_id
  for update;

  if v_target_role in (
    'owner',
    'organization_owner',
    'organization_admin',
    'admin',
    'manager'
  ) then
    raise exception 'protected_account_forbidden'
      using errcode = 'check_violation';
  end if;

  if v_actor_role = 'direction'
     and (
       p_new_role is distinct from 'employe'
       or v_target_role = 'direction'
     ) then
    raise exception 'direction_assignment_unauthorized'
      using errcode = 'insufficient_privilege';
  end if;

  select lower(coalesce(u.raw_app_meta_data ->> 'role', '')),
         lower(coalesce(u.raw_user_meta_data ->> 'role', ''))
    into v_app_role, v_user_role
  from auth.users u
  where u.id = p_target_user_id;

  if not found then
    raise exception 'target_missing'
      using errcode = 'no_data_found';
  end if;

  if v_app_role in (
       'owner',
       'admin',
       'manager',
       'organization_owner',
       'organization_admin'
     )
     or v_user_role in (
       'owner',
       'admin',
       'manager',
       'organization_owner',
       'organization_admin'
     ) then
    raise exception 'protected_account_forbidden'
      using errcode = 'check_violation';
  end if;

  if v_target_id is null then
    insert into public.organization_memberships (
      organization_id,
      user_id,
      role,
      status,
      is_default,
      joined_at,
      suspended_at
    ) values (
      p_organization_id,
      p_target_user_id,
      p_new_role,
      'active',
      coalesce(p_is_default, false),
      pg_catalog.now(),
      null
    )
    returning id into v_target_id;
    v_previous := null;
    v_action := 'insert';
  elsif v_target_role = p_new_role and v_target_status = 'active' then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'action', 'noop',
      'role', p_new_role,
      'membership_id', v_target_id,
      'audited', false
    );
  else
    v_previous := v_target_role;
    update public.organization_memberships
       set role = p_new_role,
           status = 'active',
           suspended_at = null,
           updated_at = pg_catalog.now()
     where id = v_target_id
       and organization_id = p_organization_id
       and user_id = p_target_user_id;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'membership_role_write_failed'
        using errcode = 'check_violation';
    end if;
    v_action := 'assign';
  end if;

  insert into public.user_role_audit_logs (
    target_user_id,
    target_employee_id,
    old_role,
    new_role,
    changed_by_user_id,
    changed_by_email,
    reason
  ) values (
    p_target_user_id,
    p_target_employee_id,
    coalesce(v_previous, 'absent'),
    p_new_role,
    p_actor_user_id,
    nullif(btrim(coalesce(p_changed_by_email, '')), ''),
    nullif(btrim(coalesce(p_reason, '')), '')
  )
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'action', v_action,
    'role', p_new_role,
    'membership_id', v_target_id,
    'audit_id', v_audit_id,
    'audited', true
  );
end;
$$;

comment on function public.commit_horora_membership_role_with_audit(uuid, uuid, uuid, text, boolean, bigint, text, text) is
  'LOCAL PROPOSAL. organization_memberships.role and user_role_audit_logs commit in one transaction. Does not write app_metadata.role. Do not apply without a separate Martin GO.';

revoke all on function public.commit_horora_membership_role_with_audit(uuid, uuid, uuid, text, boolean, bigint, text, text) from public;
revoke all on function public.commit_horora_membership_role_with_audit(uuid, uuid, uuid, text, boolean, bigint, text, text) from anon;
revoke all on function public.commit_horora_membership_role_with_audit(uuid, uuid, uuid, text, boolean, bigint, text, text) from authenticated;
revoke all on function public.commit_horora_membership_role_with_audit(uuid, uuid, uuid, text, boolean, bigint, text, text) from service_role;
grant execute on function public.commit_horora_membership_role_with_audit(uuid, uuid, uuid, text, boolean, bigint, text, text) to service_role;
