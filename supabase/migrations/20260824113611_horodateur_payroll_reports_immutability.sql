-- HORORA V1 — payroll accountant report foundation (lot 2/4): snapshots + issued immutability.

begin;

create table if not exists public.horodateur_payroll_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  organization_company_id uuid not null
    references public.organization_companies (id)
    on delete restrict,
  cycle_id uuid not null,
  revision integer not null,
  status text not null,
  timezone text not null,
  period_start date not null,
  period_end date not null,
  source_hash text not null,
  completeness_status text not null,
  force_emit_reason text null,
  payload jsonb not null default '{}'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  issued_at timestamptz null,
  issued_by uuid null
    references auth.users (id)
    on delete set null,
  issued_by_kind text not null default 'user',
  created_at timestamptz not null default timezone('utc', now()),
  constraint horodateur_payroll_reports_revision_check
    check (revision >= 1),
  constraint horodateur_payroll_reports_status_check
    check (status in ('draft', 'issued')),
  constraint horodateur_payroll_reports_period_order_check
    check (period_start <= period_end),
  constraint horodateur_payroll_reports_timezone_check
    check (char_length(btrim(timezone)) > 0),
  constraint horodateur_payroll_reports_source_hash_check
    check (char_length(btrim(source_hash)) > 0),
  constraint horodateur_payroll_reports_completeness_check
    check (completeness_status in ('complete', 'blocked_incomplete', 'forced')),
  constraint horodateur_payroll_reports_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint horodateur_payroll_reports_totals_object_check
    check (jsonb_typeof(totals) = 'object'),
  constraint horodateur_payroll_reports_issued_by_kind_check
    check (issued_by_kind in ('user', 'scheduler')),
  constraint horodateur_payroll_reports_issued_consistency_check
    check (
      status <> 'issued'
      or (
        issued_at is not null
        and completeness_status in ('complete', 'forced')
      )
    ),
  constraint horodateur_payroll_reports_forced_reason_check
    check (
      completeness_status <> 'forced'
      or char_length(btrim(coalesce(force_emit_reason, ''))) > 0
    ),
  constraint horodateur_payroll_reports_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id)
    on delete restrict,
  constraint horodateur_payroll_reports_cycle_tenant_fkey
    foreign key (cycle_id, organization_id, organization_company_id)
    references public.horodateur_payroll_cycles (
      id,
      organization_id,
      organization_company_id
    )
    on delete restrict
);

comment on table public.horodateur_payroll_reports is
  'HORORA V1: payroll accountant snapshots. Issued rows are immutable; revisions are append-only inserts.';

create unique index if not exists horodateur_payroll_reports_org_company_cycle_revision_uidx
  on public.horodateur_payroll_reports (
    organization_id,
    organization_company_id,
    cycle_id,
    revision
  );

create unique index if not exists horodateur_payroll_reports_one_draft_per_cycle_uidx
  on public.horodateur_payroll_reports (cycle_id)
  where status = 'draft';

create unique index if not exists horodateur_payroll_reports_id_org_uidx
  on public.horodateur_payroll_reports (id, organization_id);

create unique index if not exists horodateur_payroll_reports_id_org_cycle_uidx
  on public.horodateur_payroll_reports (id, organization_id, cycle_id);

create unique index if not exists horodateur_payroll_reports_id_org_company_cycle_uidx
  on public.horodateur_payroll_reports (
    id,
    organization_id,
    organization_company_id,
    cycle_id
  );

create index if not exists horodateur_payroll_reports_org_company_issued_idx
  on public.horodateur_payroll_reports (
    organization_id,
    organization_company_id,
    issued_at desc
  );

create or replace function public.prevent_horodateur_payroll_issued_report_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'issued' then
      raise exception 'issued horodateur payroll reports are immutable'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.status = 'issued' then
    raise exception 'issued horodateur payroll reports are immutable'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.prevent_horodateur_payroll_issued_report_mutation() is
  'Blocks UPDATE/DELETE of issued payroll snapshots. SECURITY INVOKER. search_path=pg_catalog.';

revoke all on function public.prevent_horodateur_payroll_issued_report_mutation() from public;
revoke all on function public.prevent_horodateur_payroll_issued_report_mutation() from anon;
revoke all on function public.prevent_horodateur_payroll_issued_report_mutation() from authenticated;
grant execute on function public.prevent_horodateur_payroll_issued_report_mutation() to service_role;

drop trigger if exists trg_horodateur_payroll_reports_issued_immutable
  on public.horodateur_payroll_reports;
create trigger trg_horodateur_payroll_reports_issued_immutable
  before update or delete on public.horodateur_payroll_reports
  for each row execute function public.prevent_horodateur_payroll_issued_report_mutation();

create or replace function public.prevent_horodateur_payroll_reports_truncate()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'horodateur_payroll_reports truncate is forbidden'
    using errcode = 'check_violation';
end;
$$;

comment on function public.prevent_horodateur_payroll_reports_truncate() is
  'Distinct BEFORE TRUNCATE guard. Always refuses TRUNCATE, including issued snapshots. SECURITY INVOKER.';

revoke all on function public.prevent_horodateur_payroll_reports_truncate() from public;
revoke all on function public.prevent_horodateur_payroll_reports_truncate() from anon;
revoke all on function public.prevent_horodateur_payroll_reports_truncate() from authenticated;
grant execute on function public.prevent_horodateur_payroll_reports_truncate() to service_role;

drop trigger if exists trg_horodateur_payroll_reports_no_truncate
  on public.horodateur_payroll_reports;
create trigger trg_horodateur_payroll_reports_no_truncate
  before truncate on public.horodateur_payroll_reports
  for each statement execute function public.prevent_horodateur_payroll_reports_truncate();

alter table public.horodateur_payroll_reports enable row level security;
alter table public.horodateur_payroll_reports force row level security;

drop policy if exists horodateur_payroll_reports_anon_deny
  on public.horodateur_payroll_reports;
create policy horodateur_payroll_reports_anon_deny
  on public.horodateur_payroll_reports
  for all to anon
  using (false)
  with check (false);

drop policy if exists horodateur_payroll_reports_authenticated_deny
  on public.horodateur_payroll_reports;
create policy horodateur_payroll_reports_authenticated_deny
  on public.horodateur_payroll_reports
  for all to authenticated
  using (false)
  with check (false);

revoke all on table public.horodateur_payroll_reports from public;
revoke all on table public.horodateur_payroll_reports from anon;
revoke all on table public.horodateur_payroll_reports from authenticated;
revoke all on table public.horodateur_payroll_reports from service_role;
grant select, insert, update, delete on table public.horodateur_payroll_reports to service_role;

commit;
