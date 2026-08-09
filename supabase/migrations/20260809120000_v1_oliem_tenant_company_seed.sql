-- ============================================================
-- V1 Oliem tenant + operating companies seed (Phase A file only)
--
-- Deterministic / idempotent / non-destructive.
-- No DELETE. No user UUIDs. No memberships. No platform_access.
-- organization UUID resolved via slug (never hardcoded).
--
-- DO NOT confuse:
--   tenantKey  oliem_solution
--   slug       oliem-solution
--   company    oliem_solutions | titan_produits_industriels
-- ============================================================

begin;

-- 1) Tenant organization (slug = DB key; Martin tenantKey = oliem_solution)
insert into public.organizations (
  slug,
  legal_name,
  display_name,
  status,
  default_locale,
  default_currency,
  default_timezone
)
select
  'oliem-solution',
  'Oliem Solution',
  'Oliem Solution',
  'active',
  'fr-CA',
  'CAD',
  'America/Toronto'
where not exists (
  select 1
  from public.organizations o
  where o.slug = 'oliem-solution'
    and o.deleted_at is null
);

-- 2) Operating company: Oliem Solutions (default)
insert into public.organization_companies (
  organization_id,
  legal_name,
  display_name,
  company_code,
  status,
  is_default
)
select
  o.id,
  'Oliem Solutions',
  'Oliem Solutions',
  'oliem_solutions',
  'active',
  true
from public.organizations o
where o.slug = 'oliem-solution'
  and o.deleted_at is null
  and not exists (
    select 1
    from public.organization_companies c
    where c.organization_id = o.id
      and c.company_code = 'oliem_solutions'
  );

-- 3) Operating company: Titan Produits Industriels
insert into public.organization_companies (
  organization_id,
  legal_name,
  display_name,
  company_code,
  status,
  is_default
)
select
  o.id,
  'Titan Produits Industriels',
  'Titan Produits Industriels',
  'titan_produits_industriels',
  'active',
  false
from public.organizations o
where o.slug = 'oliem-solution'
  and o.deleted_at is null
  and not exists (
    select 1
    from public.organization_companies c
    where c.organization_id = o.id
      and c.company_code = 'titan_produits_industriels'
  );

-- 4) Tenant settings (1:1); nullable date/time formats left NULL
insert into public.organization_settings (
  organization_id,
  locale,
  currency,
  timezone,
  date_format,
  time_format
)
select
  o.id,
  'fr-CA',
  'CAD',
  'America/Toronto',
  null,
  null
from public.organizations o
where o.slug = 'oliem-solution'
  and o.deleted_at is null
  and not exists (
    select 1
    from public.organization_settings s
    where s.organization_id = o.id
  );

commit;
