-- HORORA V1 — payroll accountant report foundation (lot 1/4): cycle templates + cycles.
-- Fail-closed RLS, service_role only, no SECURITY DEFINER, no pay figures.

begin;

create extension if not exists btree_gist;

create table if not exists public.horodateur_payroll_cycle_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  organization_company_id uuid not null
    references public.organization_companies (id)
    on delete restrict,
  interval_days smallint not null default 14,
  anchor_period_start date not null,
  cutoff_time time not null default time '23:59:59',
  timezone text not null default 'America/Toronto',
  send_weekday smallint not null default 1,
  send_local_time time not null default time '08:00:00',
  send_timezone text not null default 'America/Toronto',
  lookahead_cycles smallint not null default 26,
  auto_emit_if_complete boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null
    references auth.users (id)
    on delete set null,
  updated_by uuid null
    references auth.users (id)
    on delete set null,
  constraint horodateur_payroll_cycle_templates_interval_days_check
    check (interval_days = 14),
  constraint horodateur_payroll_cycle_templates_timezone_check
    check (char_length(btrim(timezone)) > 0),
  constraint horodateur_payroll_cycle_templates_send_timezone_check
    check (char_length(btrim(send_timezone)) > 0),
  constraint horodateur_payroll_cycle_templates_send_weekday_check
    check (send_weekday between 0 and 6),
  constraint horodateur_payroll_cycle_templates_lookahead_check
    check (lookahead_cycles between 1 and 52),
  constraint horodateur_payroll_cycle_templates_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id)
    on delete restrict
);

comment on table public.horodateur_payroll_cycle_templates is
  'HORORA V1: recurring 14-day payroll cycle template per organization + operating company. Server/service_role only.';

create unique index if not exists horodateur_payroll_cycle_templates_one_active_uidx
  on public.horodateur_payroll_cycle_templates (organization_id, organization_company_id)
  where is_active = true;

create unique index if not exists horodateur_payroll_cycle_templates_id_org_company_uidx
  on public.horodateur_payroll_cycle_templates (
    id,
    organization_id,
    organization_company_id
  );

create index if not exists horodateur_payroll_cycle_templates_org_idx
  on public.horodateur_payroll_cycle_templates (organization_id, organization_company_id);

drop trigger if exists trg_horodateur_payroll_cycle_templates_updated_at
  on public.horodateur_payroll_cycle_templates;
create trigger trg_horodateur_payroll_cycle_templates_updated_at
  before update on public.horodateur_payroll_cycle_templates
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.horodateur_payroll_cycle_templates enable row level security;
alter table public.horodateur_payroll_cycle_templates force row level security;

drop policy if exists horodateur_payroll_cycle_templates_anon_deny
  on public.horodateur_payroll_cycle_templates;
create policy horodateur_payroll_cycle_templates_anon_deny
  on public.horodateur_payroll_cycle_templates
  for all to anon
  using (false)
  with check (false);

drop policy if exists horodateur_payroll_cycle_templates_authenticated_deny
  on public.horodateur_payroll_cycle_templates;
create policy horodateur_payroll_cycle_templates_authenticated_deny
  on public.horodateur_payroll_cycle_templates
  for all to authenticated
  using (false)
  with check (false);

revoke all on table public.horodateur_payroll_cycle_templates from public;
revoke all on table public.horodateur_payroll_cycle_templates from anon;
revoke all on table public.horodateur_payroll_cycle_templates from authenticated;
revoke all on table public.horodateur_payroll_cycle_templates from service_role;
grant select, insert, update, delete on table public.horodateur_payroll_cycle_templates to service_role;

create table if not exists public.horodateur_payroll_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  organization_company_id uuid not null
    references public.organization_companies (id)
    on delete restrict,
  template_id uuid null,
  kind text not null,
  period_start date not null,
  period_end date not null,
  period_start_at timestamptz not null,
  period_end_at timestamptz not null,
  timezone text not null,
  status text not null default 'scheduled',
  exceptional_reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null
    references auth.users (id)
    on delete set null,
  constraint horodateur_payroll_cycles_kind_check
    check (kind in ('recurring', 'exceptional')),
  constraint horodateur_payroll_cycles_status_check
    check (status in ('scheduled', 'previewed', 'issued', 'cancelled')),
  constraint horodateur_payroll_cycles_period_order_check
    check (period_start <= period_end),
  constraint horodateur_payroll_cycles_period_at_order_check
    check (period_start_at < period_end_at),
  constraint horodateur_payroll_cycles_timezone_check
    check (char_length(btrim(timezone)) > 0),
  constraint horodateur_payroll_cycles_kind_template_check
    check (
      (kind = 'recurring' and template_id is not null)
      or (kind = 'exceptional' and template_id is null)
    ),
  constraint horodateur_payroll_cycles_exceptional_reason_check
    check (
      kind <> 'exceptional'
      or char_length(btrim(coalesce(exceptional_reason, ''))) > 0
    ),
  constraint horodateur_payroll_cycles_recurring_span_check
    check (
      kind <> 'recurring'
      or period_end = (period_start + 13)
    ),
  constraint horodateur_payroll_cycles_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id)
    on delete restrict,
  constraint horodateur_payroll_cycles_template_tenant_fkey
    foreign key (template_id, organization_id, organization_company_id)
    references public.horodateur_payroll_cycle_templates (
      id,
      organization_id,
      organization_company_id
    )
    on delete restrict,
  constraint horodateur_payroll_cycles_no_overlap
    exclude using gist (
      organization_id with =,
      organization_company_id with =,
      daterange(period_start, period_end, '[]') with &&
    )
    where (status <> 'cancelled')
);

comment on table public.horodateur_payroll_cycles is
  'HORORA V1: materialized payroll cycles. Recurring rows are exactly 14 inclusive days. Overlap excluded per org+company.';

comment on constraint horodateur_payroll_cycles_no_overlap on public.horodateur_payroll_cycles is
  'Prevents overlapping non-cancelled payroll periods for the same organization and operating company.';

create index if not exists horodateur_payroll_cycles_org_company_start_idx
  on public.horodateur_payroll_cycles (organization_id, organization_company_id, period_start);

create index if not exists horodateur_payroll_cycles_status_end_idx
  on public.horodateur_payroll_cycles (status, period_end);

create index if not exists horodateur_payroll_cycles_template_idx
  on public.horodateur_payroll_cycles (template_id);

create unique index if not exists horodateur_payroll_cycles_id_org_uidx
  on public.horodateur_payroll_cycles (id, organization_id);

create unique index if not exists horodateur_payroll_cycles_id_org_company_uidx
  on public.horodateur_payroll_cycles (
    id,
    organization_id,
    organization_company_id
  );

drop trigger if exists trg_horodateur_payroll_cycles_updated_at
  on public.horodateur_payroll_cycles;
create trigger trg_horodateur_payroll_cycles_updated_at
  before update on public.horodateur_payroll_cycles
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.horodateur_payroll_cycles enable row level security;
alter table public.horodateur_payroll_cycles force row level security;

drop policy if exists horodateur_payroll_cycles_anon_deny
  on public.horodateur_payroll_cycles;
create policy horodateur_payroll_cycles_anon_deny
  on public.horodateur_payroll_cycles
  for all to anon
  using (false)
  with check (false);

drop policy if exists horodateur_payroll_cycles_authenticated_deny
  on public.horodateur_payroll_cycles;
create policy horodateur_payroll_cycles_authenticated_deny
  on public.horodateur_payroll_cycles
  for all to authenticated
  using (false)
  with check (false);

revoke all on table public.horodateur_payroll_cycles from public;
revoke all on table public.horodateur_payroll_cycles from anon;
revoke all on table public.horodateur_payroll_cycles from authenticated;
revoke all on table public.horodateur_payroll_cycles from service_role;
grant select, insert, update, delete on table public.horodateur_payroll_cycles to service_role;

commit;
