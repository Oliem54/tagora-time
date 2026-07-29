-- ============================================================
-- H4-B1 forward-only — tenant root foundation (lot 1/3)
--
-- Scope:
--   public.set_saas_foundation_updated_at()
--   public.organizations
--   public.organization_companies
--   public.organization_settings
--   associated triggers / indexes / RLS / grants
--
-- Hardening (Martin D2):
--   SECURITY INVOKER
--   SET search_path = pg_catalog
--   REVOKE EXECUTE from PUBLIC / anon / authenticated
--   GRANT EXECUTE to service_role only
--
-- Forbidden: memberships, invitations, platform_access*,
-- business ALTER, seed, backfill, H4-B2/B3, H5-F5,
-- repair of original 20260712220x00 versions.
-- Idempotent with local reset where 20260712220[0-2]00 already ran.
-- ============================================================

begin;

create extension if not exists pgcrypto;

create or replace function public.set_saas_foundation_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

comment on function public.set_saas_foundation_updated_at() is
  'H4-B1: shared BEFORE UPDATE trigger helper for tenant foundation tables. SECURITY INVOKER. search_path=pg_catalog. EXECUTE service_role only.';

revoke all on function public.set_saas_foundation_updated_at() from public;
revoke all on function public.set_saas_foundation_updated_at() from anon;
revoke all on function public.set_saas_foundation_updated_at() from authenticated;
grant execute on function public.set_saas_foundation_updated_at() to service_role;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  legal_name text not null,
  display_name text not null,
  status text not null default 'pending',
  default_locale text not null default 'fr-CA',
  default_currency text not null default 'CAD',
  default_timezone text not null default 'UTC',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  suspended_at timestamptz null,
  deleted_at timestamptz null,
  metadata jsonb null,
  constraint organizations_status_check
    check (status in ('active', 'suspended', 'pending')),
  constraint organizations_slug_format_check
    check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organizations_default_locale_check
    check (char_length(trim(default_locale)) > 0),
  constraint organizations_default_currency_check
    check (default_currency = upper(default_currency) and char_length(default_currency) = 3),
  constraint organizations_suspended_consistency_check
    check (
      (status = 'suspended' and suspended_at is not null)
      or (status <> 'suspended' and suspended_at is null)
    )
);

comment on table public.organizations is
  'H4-B1: SaaS tenant root. Memberships/invitations/platform access arrive in H4-B2/B3.';

create unique index if not exists organizations_slug_active_uidx
  on public.organizations (slug)
  where deleted_at is null;

create index if not exists organizations_status_idx
  on public.organizations (status);

create index if not exists organizations_deleted_at_idx
  on public.organizations (deleted_at);

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.organizations enable row level security;
alter table public.organizations force row level security;

revoke all on table public.organizations from public;
revoke all on table public.organizations from anon;
revoke all on table public.organizations from authenticated;
grant select, insert, update, delete on table public.organizations to service_role;

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
  'H4-B1: Internal legal/ops companies inside a tenant. Never a tenant boundary.';

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

revoke all on table public.organization_companies from public;
revoke all on table public.organization_companies from anon;
revoke all on table public.organization_companies from authenticated;
grant select, insert, update, delete on table public.organization_companies to service_role;

create table if not exists public.organization_settings (
  organization_id uuid primary key
    references public.organizations (id)
    on delete restrict,
  locale text not null default 'fr-CA',
  currency text not null default 'CAD',
  timezone text not null default 'UTC',
  date_format text null,
  time_format text null,
  week_start smallint null,
  branding jsonb null default '{}'::jsonb,
  notification_defaults jsonb null default '{}'::jsonb,
  operational_policies jsonb null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_settings_locale_check
    check (char_length(trim(locale)) > 0),
  constraint organization_settings_currency_check
    check (currency = upper(currency) and char_length(currency) = 3),
  constraint organization_settings_timezone_check
    check (char_length(trim(timezone)) > 0),
  constraint organization_settings_week_start_check
    check (week_start is null or week_start between 0 and 6),
  constraint organization_settings_branding_object_check
    check (branding is null or jsonb_typeof(branding) = 'object'),
  constraint organization_settings_notification_defaults_object_check
    check (
      notification_defaults is null
      or jsonb_typeof(notification_defaults) = 'object'
    ),
  constraint organization_settings_operational_policies_object_check
    check (
      operational_policies is null
      or jsonb_typeof(operational_policies) = 'object'
    )
);

comment on table public.organization_settings is
  'H4-B1: Tenant-level settings 1:1. No auto-create. Branding organization-scoped.';

drop trigger if exists trg_organization_settings_updated_at on public.organization_settings;
create trigger trg_organization_settings_updated_at
  before update on public.organization_settings
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.organization_settings enable row level security;
alter table public.organization_settings force row level security;

revoke all on table public.organization_settings from public;
revoke all on table public.organization_settings from anon;
revoke all on table public.organization_settings from authenticated;
grant select, insert, update, delete on table public.organization_settings to service_role;

commit;
