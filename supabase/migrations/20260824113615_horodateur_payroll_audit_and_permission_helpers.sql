-- HORORA V1 — payroll accountant report foundation (lot 4/4): append-only audit + JWT helpers.
-- Helpers are SECURITY INVOKER and read app_metadata only. API membership helper remains authoritative.

begin;

create table if not exists public.horodateur_payroll_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  organization_company_id uuid null
    references public.organization_companies (id)
    on delete restrict,
  actor_user_id uuid null
    references auth.users (id)
    on delete set null,
  actor_kind text not null,
  action text not null,
  cycle_id uuid null,
  report_id uuid null,
  delivery_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint horodateur_payroll_audit_log_actor_kind_check
    check (actor_kind in ('user', 'scheduler')),
  constraint horodateur_payroll_audit_log_action_check
    check (
      action in (
        'view_preview',
        'view_issued',
        'recalculate',
        'emit',
        'download_pdf',
        'download_csv',
        'send_auto',
        'resend_manual',
        'retry',
        'configure_cycle',
        'configure_recipients',
        'blocked_incomplete'
      )
    ),
  constraint horodateur_payroll_audit_log_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint horodateur_payroll_audit_log_no_secrets_hint_check
    check (
      not (metadata ? 'password')
      and not (metadata ? 'token')
      and not (metadata ? 'secret')
      and not (metadata ? 'service_role_key')
    ),
  -- Close MATCH SIMPLE gaps: a leading reference id may not be set while
  -- company/cycle/report stay NULL, otherwise the composite tenant FKs would
  -- be skipped. Org-level rows (all four nullable) remain valid. Table CHECKs
  -- apply to service_role; they are not RLS and cannot be bypassed.
  constraint horodateur_payroll_audit_log_cycle_reference_complete_check
    check (
      cycle_id is null
      or organization_company_id is not null
    ),
  constraint horodateur_payroll_audit_log_report_reference_complete_check
    check (
      report_id is null
      or (
        cycle_id is not null
        and organization_company_id is not null
      )
    ),
  constraint horodateur_payroll_audit_log_delivery_reference_complete_check
    check (
      delivery_id is null
      or (
        report_id is not null
        and cycle_id is not null
        and organization_company_id is not null
      )
    ),
  constraint horodateur_payroll_audit_log_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id)
    on delete restrict,
  constraint horodateur_payroll_audit_log_cycle_org_fkey
    foreign key (cycle_id, organization_id)
    references public.horodateur_payroll_cycles (id, organization_id)
    on delete restrict,
  constraint horodateur_payroll_audit_log_cycle_tenant_fkey
    foreign key (cycle_id, organization_id, organization_company_id)
    references public.horodateur_payroll_cycles (
      id,
      organization_id,
      organization_company_id
    )
    on delete restrict,
  constraint horodateur_payroll_audit_log_report_org_fkey
    foreign key (report_id, organization_id)
    references public.horodateur_payroll_reports (id, organization_id)
    on delete restrict,
  constraint horodateur_payroll_audit_log_report_cycle_org_fkey
    foreign key (report_id, organization_id, cycle_id)
    references public.horodateur_payroll_reports (id, organization_id, cycle_id)
    on delete restrict,
  constraint horodateur_payroll_audit_log_report_tenant_fkey
    foreign key (
      report_id,
      organization_id,
      organization_company_id,
      cycle_id
    )
    references public.horodateur_payroll_reports (
      id,
      organization_id,
      organization_company_id,
      cycle_id
    )
    on delete restrict,
  constraint horodateur_payroll_audit_log_delivery_org_fkey
    foreign key (delivery_id, organization_id)
    references public.horodateur_payroll_deliveries (id, organization_id)
    on delete restrict,
  constraint horodateur_payroll_audit_log_delivery_cycle_report_org_fkey
    foreign key (delivery_id, organization_id, cycle_id, report_id)
    references public.horodateur_payroll_deliveries (
      id,
      organization_id,
      cycle_id,
      report_id
    )
    on delete restrict,
  constraint horodateur_payroll_audit_log_delivery_tenant_fkey
    foreign key (
      delivery_id,
      organization_id,
      organization_company_id,
      cycle_id,
      report_id
    )
    references public.horodateur_payroll_deliveries (
      id,
      organization_id,
      organization_company_id,
      cycle_id,
      report_id
    )
    on delete restrict
);

comment on table public.horodateur_payroll_audit_log is
  'HORORA V1: append-only payroll audit. Org-level rows may omit company and entity refs. Any cycle/report/delivery ref must include the full tenant tuple so MATCH SIMPLE cannot skip composite FKs. No pay figures.';

create index if not exists horodateur_payroll_audit_log_org_created_idx
  on public.horodateur_payroll_audit_log (organization_id, created_at desc);

create index if not exists horodateur_payroll_audit_log_report_idx
  on public.horodateur_payroll_audit_log (report_id);

create index if not exists horodateur_payroll_audit_log_action_created_idx
  on public.horodateur_payroll_audit_log (action, created_at desc);

create or replace function public.prevent_horodateur_payroll_audit_log_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'horodateur_payroll_audit_log is append-only'
    using errcode = 'check_violation';
end;
$$;

comment on function public.prevent_horodateur_payroll_audit_log_mutation() is
  'Blocks UPDATE/DELETE/TRUNCATE on payroll audit log. SECURITY INVOKER. search_path=pg_catalog.';

revoke all on function public.prevent_horodateur_payroll_audit_log_mutation() from public;
revoke all on function public.prevent_horodateur_payroll_audit_log_mutation() from anon;
revoke all on function public.prevent_horodateur_payroll_audit_log_mutation() from authenticated;
grant execute on function public.prevent_horodateur_payroll_audit_log_mutation() to service_role;

drop trigger if exists trg_horodateur_payroll_audit_log_no_update_delete
  on public.horodateur_payroll_audit_log;
create trigger trg_horodateur_payroll_audit_log_no_update_delete
  before update or delete on public.horodateur_payroll_audit_log
  for each row execute function public.prevent_horodateur_payroll_audit_log_mutation();

drop trigger if exists trg_horodateur_payroll_audit_log_no_truncate
  on public.horodateur_payroll_audit_log;
create trigger trg_horodateur_payroll_audit_log_no_truncate
  before truncate on public.horodateur_payroll_audit_log
  for each statement execute function public.prevent_horodateur_payroll_audit_log_mutation();

alter table public.horodateur_payroll_audit_log enable row level security;
alter table public.horodateur_payroll_audit_log force row level security;

drop policy if exists horodateur_payroll_audit_log_anon_deny
  on public.horodateur_payroll_audit_log;
create policy horodateur_payroll_audit_log_anon_deny
  on public.horodateur_payroll_audit_log
  for all to anon
  using (false)
  with check (false);

drop policy if exists horodateur_payroll_audit_log_authenticated_deny
  on public.horodateur_payroll_audit_log;
create policy horodateur_payroll_audit_log_authenticated_deny
  on public.horodateur_payroll_audit_log
  for all to authenticated
  using (false)
  with check (false);

revoke all on table public.horodateur_payroll_audit_log from public;
revoke all on table public.horodateur_payroll_audit_log from anon;
revoke all on table public.horodateur_payroll_audit_log from authenticated;
revoke all on table public.horodateur_payroll_audit_log from service_role;
grant select, insert on table public.horodateur_payroll_audit_log to service_role;

create or replace function public.current_user_has_horodateur_payroll_read()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select
    public.current_app_role() = 'admin'
    or 'horodateur_payroll_read' = any (public.current_app_permissions())
    or 'horodateur_payroll_manage' = any (public.current_app_permissions());
$$;

comment on function public.current_user_has_horodateur_payroll_read() is
  'JWT app_metadata defense helper only. API membership helper is authoritative. Never reads user JWT user_metadata.';

create or replace function public.current_user_has_horodateur_payroll_manage()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select
    public.current_app_role() = 'admin'
    or 'horodateur_payroll_manage' = any (public.current_app_permissions());
$$;

comment on function public.current_user_has_horodateur_payroll_manage() is
  'JWT app_metadata defense helper only. API membership helper is authoritative. Never reads user JWT user_metadata.';

revoke all on function public.current_user_has_horodateur_payroll_read() from public;
revoke all on function public.current_user_has_horodateur_payroll_read() from anon;
grant execute on function public.current_user_has_horodateur_payroll_read() to authenticated;
grant execute on function public.current_user_has_horodateur_payroll_read() to service_role;

revoke all on function public.current_user_has_horodateur_payroll_manage() from public;
revoke all on function public.current_user_has_horodateur_payroll_manage() from anon;
grant execute on function public.current_user_has_horodateur_payroll_manage() to authenticated;
grant execute on function public.current_user_has_horodateur_payroll_manage() to service_role;

commit;
