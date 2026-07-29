-- SaaS 1B.1 — organization_settings (1:1 tenant settings)

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
  'Tenant-level settings. Branding is organization-scoped, not company-scoped.';

drop trigger if exists trg_organization_settings_updated_at on public.organization_settings;
create trigger trg_organization_settings_updated_at
  before update on public.organization_settings
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.organization_settings enable row level security;
alter table public.organization_settings force row level security;

revoke all on table public.organization_settings from anon, authenticated;
grant select, insert, update, delete on table public.organization_settings to service_role;
