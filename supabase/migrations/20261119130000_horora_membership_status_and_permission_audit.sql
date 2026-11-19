-- LOCAL PREPARATION. Do not apply to Staging or Production without a distinct GO.
-- 20261118190000_horora_zero_access_provisioning_prepared.sql stays NOT_EXECUTED.
-- This script does not grant a Nexus role, does not create a user, and does not
-- write auth.users. Service role only. Anonymous and authenticated cannot execute it.
--
-- Rollback, only under a later distinct GO:
-- revoke all on function public.commit_horora_membership_status_with_audit(uuid, uuid, uuid, text, text) from service_role;
-- revoke all on function public.commit_horora_permission_override_with_audit(uuid, uuid, uuid, text, text, text) from service_role;
-- drop function public.commit_horora_membership_status_with_audit(uuid, uuid, uuid, text, text);
-- drop function public.commit_horora_permission_override_with_audit(uuid, uuid, uuid, text, text, text);
-- drop table public.horora_permission_audit;
-- drop table public.horora_permission_overrides;

create table if not exists public.horora_permission_overrides (
  organization_id uuid not null,
  user_id uuid not null,
  capability text not null,
  effect text not null check (effect in ('allow', 'deny')),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (organization_id, user_id, capability)
);

create table if not exists public.horora_permission_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  target_user_id uuid not null,
  actor_user_id uuid not null,
  capability text not null,
  previous_effect text,
  next_effect text not null check (next_effect in ('allow', 'deny')),
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists horora_permission_audit_org_idx
  on public.horora_permission_audit (organization_id, created_at);

alter table public.horora_permission_overrides enable row level security;
alter table public.horora_permission_audit enable row level security;

revoke all on table public.horora_permission_overrides from public;
revoke all on table public.horora_permission_overrides from anon;
revoke all on table public.horora_permission_overrides from authenticated;
revoke all on table public.horora_permission_audit from public;
revoke all on table public.horora_permission_audit from anon;
revoke all on table public.horora_permission_audit from authenticated;
grant select, insert, update, delete on table public.horora_permission_overrides to service_role;
grant select, insert on table public.horora_permission_audit to service_role;

create or replace function public.commit_horora_membership_status_with_audit(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_target_user_id uuid,
  p_next_status text,
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
  v_updated integer;
  v_audit_id bigint;
begin
  if p_actor_user_id is null
     or p_organization_id is null
     or p_target_user_id is null
     or p_next_status is null then
    raise exception 'session_unreliable'
      using errcode = 'check_violation';
  end if;

  if p_next_status is distinct from 'active'
     and p_next_status is distinct from 'suspended' then
    raise exception 'writer_not_connected'
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
     or v_actor_role not in ('organization_owner', 'organization_admin') then
    raise exception 'actor_forbidden'
      using errcode = 'insufficient_privilege';
  end if;

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

  if v_target_id is null then
    raise exception 'target_missing'
      using errcode = 'no_data_found';
  end if;

  if v_target_role is distinct from 'employe'
     and v_target_role is distinct from 'direction' then
    raise exception 'protected_account_forbidden'
      using errcode = 'check_violation';
  end if;

  if v_target_status = p_next_status then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'action', 'noop',
      'status', p_next_status,
      'role', v_target_role,
      'audited', false
    );
  end if;

  update public.organization_memberships
     set status = p_next_status,
         suspended_at = case
           when p_next_status = 'suspended' then pg_catalog.now()
           else null
         end,
         updated_at = pg_catalog.now()
   where id = v_target_id
     and organization_id = p_organization_id
     and user_id = p_target_user_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'membership_status_write_failed'
      using errcode = 'check_violation';
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
    null,
    v_target_role,
    v_target_role,
    p_actor_user_id,
    null,
    nullif(btrim(coalesce(p_reason, '')), '')
  )
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'action', 'status',
    'status', p_next_status,
    'role', v_target_role,
    'audit_id', v_audit_id,
    'audited', true
  );
end;
$$;

create or replace function public.commit_horora_permission_override_with_audit(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_target_user_id uuid,
  p_capability text,
  p_effect text,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_actor_role text;
  v_target_role text;
  v_previous text;
  v_audit_id bigint;
begin
  if p_actor_user_id is null
     or p_organization_id is null
     or p_target_user_id is null
     or p_capability is null
     or p_effect is null then
    raise exception 'session_unreliable'
      using errcode = 'check_violation';
  end if;

  if p_effect is distinct from 'allow' and p_effect is distinct from 'deny' then
    raise exception 'writer_not_connected'
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
    and m.status = 'active';

  if v_actor_role is null
     or v_actor_role not in ('organization_owner', 'organization_admin') then
    raise exception 'actor_forbidden'
      using errcode = 'insufficient_privilege';
  end if;

  select m.role
    into v_target_role
  from public.organization_memberships m
  where m.user_id = p_target_user_id
    and m.organization_id = p_organization_id;

  if v_target_role is null then
    raise exception 'target_missing'
      using errcode = 'no_data_found';
  end if;

  if v_target_role is distinct from 'employe'
     and v_target_role is distinct from 'direction' then
    raise exception 'protected_account_forbidden'
      using errcode = 'check_violation';
  end if;

  if p_effect = 'allow' and v_target_role = 'employe' and p_capability in (
    'manage_employees',
    'manage_configuration',
    'admin_finance',
    'read_payroll',
    'manage_payroll',
    'export_payroll',
    'view_team',
    'approve_anomalies',
    'correct_time',
    'view_reports'
  ) then
    raise exception 'privilege_escalation_forbidden'
      using errcode = 'check_violation';
  end if;

  if p_effect = 'allow' and v_target_role = 'direction' and p_capability in (
    'punch_in_out',
    'punch_break_meal',
    'view_own_hours',
    'request_own_correction',
    'manage_configuration',
    'admin_finance'
  ) then
    raise exception 'privilege_escalation_forbidden'
      using errcode = 'check_violation';
  end if;

  select effect
    into v_previous
  from public.horora_permission_overrides
  where organization_id = p_organization_id
    and user_id = p_target_user_id
    and capability = p_capability;

  insert into public.horora_permission_overrides (
    organization_id,
    user_id,
    capability,
    effect,
    updated_at
  ) values (
    p_organization_id,
    p_target_user_id,
    p_capability,
    p_effect,
    pg_catalog.now()
  )
  on conflict (organization_id, user_id, capability)
  do update set effect = excluded.effect, updated_at = pg_catalog.now();

  insert into public.horora_permission_audit (
    organization_id,
    target_user_id,
    actor_user_id,
    capability,
    previous_effect,
    next_effect
  ) values (
    p_organization_id,
    p_target_user_id,
    p_actor_user_id,
    p_capability,
    v_previous,
    p_effect
  )
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'action', 'override',
    'effect', p_effect,
    'capability', p_capability,
    'audit_id', v_audit_id,
    'audited', true,
    'reason', nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

comment on function public.commit_horora_membership_status_with_audit(uuid, uuid, uuid, text, text) is
  'LOCAL PREPARATION. Suspends or reactivates an employe or direction membership and writes user_role_audit_logs in the same transaction. Does not apply remotely without a distinct GO.';

comment on function public.commit_horora_permission_override_with_audit(uuid, uuid, uuid, text, text, text) is
  'LOCAL PREPARATION. Records an explicit permission override for one organization. A denied baseline cannot be granted. Does not apply remotely without a distinct GO.';

revoke all on function public.commit_horora_membership_status_with_audit(uuid, uuid, uuid, text, text) from public;
revoke all on function public.commit_horora_membership_status_with_audit(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.commit_horora_membership_status_with_audit(uuid, uuid, uuid, text, text) from authenticated;
revoke all on function public.commit_horora_membership_status_with_audit(uuid, uuid, uuid, text, text) from service_role;
grant execute on function public.commit_horora_membership_status_with_audit(uuid, uuid, uuid, text, text) to service_role;

revoke all on function public.commit_horora_permission_override_with_audit(uuid, uuid, uuid, text, text, text) from public;
revoke all on function public.commit_horora_permission_override_with_audit(uuid, uuid, uuid, text, text, text) from anon;
revoke all on function public.commit_horora_permission_override_with_audit(uuid, uuid, uuid, text, text, text) from authenticated;
revoke all on function public.commit_horora_permission_override_with_audit(uuid, uuid, uuid, text, text, text) from service_role;
grant execute on function public.commit_horora_permission_override_with_audit(uuid, uuid, uuid, text, text, text) to service_role;
