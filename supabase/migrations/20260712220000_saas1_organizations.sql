-- SaaS 1B.1 — organizations (tenant foundation)
-- LOCAL foundation only. No seed data. No business-table changes.
-- Fail-closed RLS: no policies for anon/authenticated (service_role bypasses for later ops).

create extension if not exists pgcrypto;

create or replace function public.set_saas_foundation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

comment on function public.set_saas_foundation_updated_at() is
  'SaaS 1B.1: shared BEFORE UPDATE trigger helper for tenant foundation tables.';

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
  'SaaS tenant root. Not multi-tenant-complete until memberships + RLS SaaS 2.';

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

revoke all on table public.organizations from anon, authenticated;
grant select, insert, update, delete on table public.organizations to service_role;
