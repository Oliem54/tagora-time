-- HORORA V1 — payroll accountant report foundation (lot 3/4): recipients + deliveries.

begin;

create table if not exists public.horodateur_payroll_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  organization_company_id uuid null
    references public.organization_companies (id)
    on delete restrict,
  email text not null,
  display_name text null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null
    references auth.users (id)
    on delete set null,
  constraint horodateur_payroll_recipients_email_check
    check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint horodateur_payroll_recipients_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id)
    on delete restrict
);

comment on table public.horodateur_payroll_recipients is
  'HORORA V1: payroll report email recipients. organization_company_id NULL means all companies in the organization.';

create unique index if not exists horodateur_payroll_recipients_org_email_all_companies_uidx
  on public.horodateur_payroll_recipients (organization_id, email)
  where organization_company_id is null and is_active = true;

create unique index if not exists horodateur_payroll_recipients_org_company_email_uidx
  on public.horodateur_payroll_recipients (
    organization_id,
    organization_company_id,
    email
  )
  where organization_company_id is not null and is_active = true;

create index if not exists horodateur_payroll_recipients_org_idx
  on public.horodateur_payroll_recipients (organization_id, is_active);

drop trigger if exists trg_horodateur_payroll_recipients_updated_at
  on public.horodateur_payroll_recipients;
create trigger trg_horodateur_payroll_recipients_updated_at
  before update on public.horodateur_payroll_recipients
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.horodateur_payroll_recipients enable row level security;
alter table public.horodateur_payroll_recipients force row level security;

drop policy if exists horodateur_payroll_recipients_anon_deny
  on public.horodateur_payroll_recipients;
create policy horodateur_payroll_recipients_anon_deny
  on public.horodateur_payroll_recipients
  for all to anon
  using (false)
  with check (false);

drop policy if exists horodateur_payroll_recipients_authenticated_deny
  on public.horodateur_payroll_recipients;
create policy horodateur_payroll_recipients_authenticated_deny
  on public.horodateur_payroll_recipients
  for all to authenticated
  using (false)
  with check (false);

revoke all on table public.horodateur_payroll_recipients from public;
revoke all on table public.horodateur_payroll_recipients from anon;
revoke all on table public.horodateur_payroll_recipients from authenticated;
revoke all on table public.horodateur_payroll_recipients from service_role;
grant select, insert, update, delete on table public.horodateur_payroll_recipients to service_role;

create table if not exists public.horodateur_payroll_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  organization_company_id uuid not null
    references public.organization_companies (id)
    on delete restrict,
  report_id uuid not null,
  cycle_id uuid not null,
  idempotency_key text not null,
  channel text not null default 'email',
  trigger text not null,
  status text not null,
  recipients_snapshot jsonb not null default '[]'::jsonb,
  provider text not null default 'resend',
  provider_message_id text null,
  error_code text null,
  error_message text null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_retry_at timestamptz null,
  sent_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  requested_by uuid null
    references auth.users (id)
    on delete set null,
  constraint horodateur_payroll_deliveries_idempotency_key_check
    check (char_length(btrim(idempotency_key)) > 0),
  constraint horodateur_payroll_deliveries_channel_check
    check (channel = 'email'),
  constraint horodateur_payroll_deliveries_trigger_check
    check (trigger in ('scheduler', 'manual_resend', 'retry')),
  constraint horodateur_payroll_deliveries_status_check
    check (
      status in (
        'pending',
        'sending',
        'sent',
        'failed',
        'skipped_duplicate',
        'blocked_incomplete'
      )
    ),
  constraint horodateur_payroll_deliveries_recipients_array_check
    check (jsonb_typeof(recipients_snapshot) = 'array'),
  constraint horodateur_payroll_deliveries_attempt_count_check
    check (attempt_count >= 0),
  constraint horodateur_payroll_deliveries_max_attempts_check
    check (max_attempts >= 1),
  constraint horodateur_payroll_deliveries_org_company_consistency_fkey
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id)
    on delete restrict,
  constraint horodateur_payroll_deliveries_cycle_tenant_fkey
    foreign key (cycle_id, organization_id, organization_company_id)
    references public.horodateur_payroll_cycles (
      id,
      organization_id,
      organization_company_id
    )
    on delete restrict,
  constraint horodateur_payroll_deliveries_report_cycle_tenant_fkey
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
    on delete restrict
);

comment on table public.horodateur_payroll_deliveries is
  'HORORA V1: payroll email delivery journal. idempotency_key is globally unique to prevent double send.';

create unique index if not exists horodateur_payroll_deliveries_idempotency_key_uidx
  on public.horodateur_payroll_deliveries (idempotency_key);

create index if not exists horodateur_payroll_deliveries_failed_retry_idx
  on public.horodateur_payroll_deliveries (status, next_retry_at)
  where status = 'failed';

create index if not exists horodateur_payroll_deliveries_report_idx
  on public.horodateur_payroll_deliveries (report_id, created_at desc);

create index if not exists horodateur_payroll_deliveries_org_company_idx
  on public.horodateur_payroll_deliveries (
    organization_id,
    organization_company_id,
    created_at desc
  );

create unique index if not exists horodateur_payroll_deliveries_id_org_uidx
  on public.horodateur_payroll_deliveries (id, organization_id);

create unique index if not exists horodateur_payroll_deliveries_id_org_cycle_report_uidx
  on public.horodateur_payroll_deliveries (
    id,
    organization_id,
    cycle_id,
    report_id
  );

create unique index if not exists horodateur_payroll_deliveries_id_org_company_cycle_report_uidx
  on public.horodateur_payroll_deliveries (
    id,
    organization_id,
    organization_company_id,
    cycle_id,
    report_id
  );

drop trigger if exists trg_horodateur_payroll_deliveries_updated_at
  on public.horodateur_payroll_deliveries;
create trigger trg_horodateur_payroll_deliveries_updated_at
  before update on public.horodateur_payroll_deliveries
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.horodateur_payroll_deliveries enable row level security;
alter table public.horodateur_payroll_deliveries force row level security;

drop policy if exists horodateur_payroll_deliveries_anon_deny
  on public.horodateur_payroll_deliveries;
create policy horodateur_payroll_deliveries_anon_deny
  on public.horodateur_payroll_deliveries
  for all to anon
  using (false)
  with check (false);

drop policy if exists horodateur_payroll_deliveries_authenticated_deny
  on public.horodateur_payroll_deliveries;
create policy horodateur_payroll_deliveries_authenticated_deny
  on public.horodateur_payroll_deliveries
  for all to authenticated
  using (false)
  with check (false);

revoke all on table public.horodateur_payroll_deliveries from public;
revoke all on table public.horodateur_payroll_deliveries from anon;
revoke all on table public.horodateur_payroll_deliveries from authenticated;
revoke all on table public.horodateur_payroll_deliveries from service_role;
grant select, insert, update, delete on table public.horodateur_payroll_deliveries to service_role;

commit;
