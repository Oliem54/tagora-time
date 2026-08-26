-- HORORA V1 — atomic payroll accountant snapshot persist (draft or issue) + audit.
-- SECURITY INVOKER only. search_path=pg_catalog. service_role EXECUTE only.
-- Does not UPDATE issued reports. Revisions are INSERT. No pay figures.

begin;

create or replace function public.persist_horodateur_payroll_accountant_report(
  p_operation text,
  p_organization_id uuid,
  p_organization_company_id uuid,
  p_cycle_id uuid,
  p_timezone text,
  p_period_start date,
  p_period_end date,
  p_source_hash text,
  p_completeness_status text,
  p_force_emit_reason text,
  p_payload jsonb,
  p_totals jsonb,
  p_actor_user_id uuid,
  p_actor_kind text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_cycle_id uuid;
  v_cycle_start date;
  v_cycle_end date;
  v_cycle_timezone text;
  v_draft_id uuid;
  v_draft_revision integer;
  v_draft_hash text;
  v_draft_status text;
  v_report_id uuid;
  v_revision integer;
  v_status text;
  v_audit_id uuid;
  v_idempotent boolean := false;
  v_force_reason text;
  v_action text;
  v_actor_kind text;
begin
  if pg_catalog.current_user is distinct from 'service_role' then
    raise exception 'service_role_required'
      using errcode = 'insufficient_privilege';
  end if;

  if p_operation is distinct from 'save_draft' and p_operation is distinct from 'issue' then
    raise exception 'operation_invalid'
      using errcode = 'check_violation';
  end if;

  if p_organization_id is null
    or p_organization_company_id is null
    or p_cycle_id is null
  then
    raise exception 'tenant_required'
      using errcode = 'check_violation';
  end if;

  if pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_totals) is distinct from 'object'
  then
    raise exception 'payload_invalid'
      using errcode = 'check_violation';
  end if;

  if pg_catalog.btrim(coalesce(p_source_hash, '')) = '' then
    raise exception 'source_hash_required'
      using errcode = 'check_violation';
  end if;

  v_force_reason := nullif(pg_catalog.btrim(coalesce(p_force_emit_reason, '')), '');
  v_actor_kind := coalesce(nullif(pg_catalog.btrim(coalesce(p_actor_kind, '')), ''), 'user');

  if v_actor_kind is distinct from 'user' and v_actor_kind is distinct from 'scheduler' then
    raise exception 'actor_kind_invalid'
      using errcode = 'check_violation';
  end if;

  if (p_payload->>'organizationId') is distinct from p_organization_id::text
    or (p_payload->>'organizationCompanyId') is distinct from p_organization_company_id::text
    or (p_payload->>'cycleId') is distinct from p_cycle_id::text
  then
    raise exception 'payload_tenant_mismatch'
      using errcode = 'check_violation';
  end if;

  if (p_payload->>'completenessStatus') is distinct from p_completeness_status then
    raise exception 'completeness_mismatch'
      using errcode = 'check_violation';
  end if;

  select
    c.id,
    c.period_start,
    c.period_end,
    c.timezone
  into
    v_cycle_id,
    v_cycle_start,
    v_cycle_end,
    v_cycle_timezone
  from public.horodateur_payroll_cycles as c
  where c.id = p_cycle_id
    and c.organization_id = p_organization_id
    and c.organization_company_id = p_organization_company_id
  for update;

  if v_cycle_id is null then
    raise exception 'cycle_tenant_mismatch'
      using errcode = 'check_violation';
  end if;

  if v_cycle_start is distinct from p_period_start
    or v_cycle_end is distinct from p_period_end
    or v_cycle_timezone is distinct from p_timezone
  then
    raise exception 'cycle_period_mismatch'
      using errcode = 'check_violation';
  end if;

  if p_operation = 'issue' then
    if p_completeness_status = 'blocked_incomplete' then
      raise exception 'blocked_incomplete'
        using errcode = 'check_violation';
    end if;

    if p_completeness_status = 'forced' and v_force_reason is null then
      raise exception 'forced_reason_required'
        using errcode = 'check_violation';
    end if;

    if p_completeness_status = 'complete' then
      v_force_reason := null;
    end if;

    select
      r.id,
      r.revision
    into
      v_report_id,
      v_revision
    from public.horodateur_payroll_reports as r
    where r.organization_id = p_organization_id
      and r.organization_company_id = p_organization_company_id
      and r.cycle_id = p_cycle_id
      and r.status = 'issued'
      and r.source_hash = p_source_hash
    order by r.revision asc
    limit 1;

    if v_report_id is not null then
      v_status := 'issued';
      v_idempotent := true;
      v_action := null;
    else
    select coalesce(pg_catalog.max(r.revision), 0) + 1
    into v_revision
    from public.horodateur_payroll_reports as r
    where r.organization_id = p_organization_id
      and r.organization_company_id = p_organization_company_id
      and r.cycle_id = p_cycle_id;

    insert into public.horodateur_payroll_reports (
      organization_id,
      organization_company_id,
      cycle_id,
      revision,
      status,
      timezone,
      period_start,
      period_end,
      source_hash,
      completeness_status,
      force_emit_reason,
      payload,
      totals,
      issued_at,
      issued_by,
      issued_by_kind
    )
    values (
      p_organization_id,
      p_organization_company_id,
      p_cycle_id,
      v_revision,
      'issued',
      p_timezone,
      p_period_start,
      p_period_end,
      p_source_hash,
      p_completeness_status,
      v_force_reason,
      p_payload,
      p_totals,
      pg_catalog.timezone('utc', pg_catalog.now()),
      p_actor_user_id,
      v_actor_kind
    )
    returning id into v_report_id;

    v_status := 'issued';
    v_action := 'emit';
    end if;
  else
    select
      r.id,
      r.revision,
      r.source_hash,
      r.status
    into
      v_draft_id,
      v_draft_revision,
      v_draft_hash,
      v_draft_status
    from public.horodateur_payroll_reports as r
    where r.organization_id = p_organization_id
      and r.organization_company_id = p_organization_company_id
      and r.cycle_id = p_cycle_id
      and r.status = 'draft'
    for update;

    if v_draft_status is not null and v_draft_status is distinct from 'draft' then
      raise exception 'issued_immutable'
        using errcode = 'check_violation';
    end if;

    if v_draft_id is not null and v_draft_hash is not distinct from p_source_hash then
      v_report_id := v_draft_id;
      v_revision := v_draft_revision;
      v_status := 'draft';
      v_idempotent := true;
      v_action := null;
    elsif v_draft_id is not null then
      update public.horodateur_payroll_reports as r
      set
        timezone = p_timezone,
        period_start = p_period_start,
        period_end = p_period_end,
        source_hash = p_source_hash,
        completeness_status = p_completeness_status,
        force_emit_reason = v_force_reason,
        payload = p_payload,
        totals = p_totals
      where r.id = v_draft_id
        and r.organization_id = p_organization_id
        and r.organization_company_id = p_organization_company_id
        and r.cycle_id = p_cycle_id
        and r.status = 'draft'
      returning r.id into v_report_id;

      if v_report_id is null then
        raise exception 'issued_immutable'
          using errcode = 'check_violation';
      end if;

      v_revision := v_draft_revision;
      v_status := 'draft';
      v_action := 'recalculate';
    else
      select coalesce(pg_catalog.max(r.revision), 0) + 1
      into v_revision
      from public.horodateur_payroll_reports as r
      where r.organization_id = p_organization_id
        and r.organization_company_id = p_organization_company_id
        and r.cycle_id = p_cycle_id;

      insert into public.horodateur_payroll_reports (
        organization_id,
        organization_company_id,
        cycle_id,
        revision,
        status,
        timezone,
        period_start,
        period_end,
        source_hash,
        completeness_status,
        force_emit_reason,
        payload,
        totals,
        issued_at,
        issued_by,
        issued_by_kind
      )
      values (
        p_organization_id,
        p_organization_company_id,
        p_cycle_id,
        v_revision,
        'draft',
        p_timezone,
        p_period_start,
        p_period_end,
        p_source_hash,
        p_completeness_status,
        v_force_reason,
        p_payload,
        p_totals,
        null,
        null,
        v_actor_kind
      )
      returning id into v_report_id;

      v_status := 'draft';
      v_action := 'recalculate';
    end if;
  end if;

  if v_action is not null then
    insert into public.horodateur_payroll_audit_log (
      organization_id,
      organization_company_id,
      actor_user_id,
      actor_kind,
      action,
      cycle_id,
      report_id,
      metadata
    )
    values (
      p_organization_id,
      p_organization_company_id,
      p_actor_user_id,
      v_actor_kind,
      v_action,
      p_cycle_id,
      v_report_id,
      pg_catalog.jsonb_build_object(
        'source_hash', p_source_hash,
        'completeness_status', p_completeness_status,
        'revision', v_revision,
        'operation', p_operation
      )
    )
    returning id into v_audit_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'report_id', v_report_id,
    'revision', v_revision,
    'status', v_status,
    'source_hash', p_source_hash,
    'completeness_status', p_completeness_status,
    'idempotent', v_idempotent,
    'audit_id', v_audit_id
  );
end;
$$;

comment on function public.persist_horodateur_payroll_accountant_report(
  text,
  uuid,
  uuid,
  uuid,
  text,
  date,
  date,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid,
  text
) is
  'HORORA V1: atomic draft/issue persist + audit. SECURITY INVOKER. Locks cycle row. Never UPDATE issued. service_role only.';

revoke all on function public.persist_horodateur_payroll_accountant_report(
  text,
  uuid,
  uuid,
  uuid,
  text,
  date,
  date,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid,
  text
) from public;
revoke all on function public.persist_horodateur_payroll_accountant_report(
  text,
  uuid,
  uuid,
  uuid,
  text,
  date,
  date,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid,
  text
) from anon;
revoke all on function public.persist_horodateur_payroll_accountant_report(
  text,
  uuid,
  uuid,
  uuid,
  text,
  date,
  date,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid,
  text
) from authenticated;
revoke execute on function public.persist_horodateur_payroll_accountant_report(
  text,
  uuid,
  uuid,
  uuid,
  text,
  date,
  date,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid,
  text
) from public;
revoke execute on function public.persist_horodateur_payroll_accountant_report(
  text,
  uuid,
  uuid,
  uuid,
  text,
  date,
  date,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid,
  text
) from anon;
revoke execute on function public.persist_horodateur_payroll_accountant_report(
  text,
  uuid,
  uuid,
  uuid,
  text,
  date,
  date,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid,
  text
) from authenticated;
grant execute on function public.persist_horodateur_payroll_accountant_report(
  text,
  uuid,
  uuid,
  uuid,
  text,
  date,
  date,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid,
  text
) to service_role;

commit;
