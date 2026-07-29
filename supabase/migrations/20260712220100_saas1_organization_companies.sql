-- SaaS 1B.1 — organization_companies (internal companies, not tenants)

create table if not exists public.organization_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  legal_name text not null,
  display_name text not null,
  company_code text not null,
  legal_number text null,
  status text not null default 'active',
  is_default boolean not null default false,
  operational_settings jsonb null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_companies_status_check
    check (status in ('active', 'inactive')),
  constraint organization_companies_code_format_check
    check (
      company_code = lower(company_code)
      and company_code ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
    ),
  constraint organization_companies_operational_settings_object_check
    check (
      operational_settings is null
      or jsonb_typeof(operational_settings) = 'object'
    )
);

comment on table public.organization_companies is
  'Internal legal/ops companies inside a tenant. Never a tenant boundary.';

comment on column public.organization_companies.operational_settings is
  'Company-scoped operational settings. Tenant branding lives on organization_settings.';

create unique index if not exists organization_companies_org_code_uidx
  on public.organization_companies (organization_id, company_code);

create unique index if not exists organization_companies_one_default_uidx
  on public.organization_companies (organization_id)
  where is_default = true;

create index if not exists organization_companies_org_id_idx
  on public.organization_companies (organization_id);

create index if not exists organization_companies_org_status_idx
  on public.organization_companies (organization_id, status);

drop trigger if exists trg_organization_companies_updated_at on public.organization_companies;
create trigger trg_organization_companies_updated_at
  before update on public.organization_companies
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.organization_companies enable row level security;
alter table public.organization_companies force row level security;

revoke all on table public.organization_companies from anon, authenticated;
grant select, insert, update, delete on table public.organization_companies to service_role;
