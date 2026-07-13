-- SaaS 1B.1 — platform_access + platform_access_audit
-- Platform roles stay outside organization_memberships.

create table if not exists public.platform_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users (id)
    on delete restrict,
  access_level text not null,
  status text not null default 'active',
  reason text not null,
  granted_by uuid null
    references auth.users (id)
    on delete set null,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint platform_access_level_check
    check (access_level in ('platform_super_admin', 'platform_support')),
  constraint platform_access_status_check
    check (status in ('active', 'revoked', 'expired')),
  constraint platform_access_reason_check
    check (char_length(trim(reason)) > 0),
  constraint platform_access_support_expires_check
    check (
      access_level <> 'platform_support'
      or expires_at is not null
    ),
  constraint platform_access_revoked_consistency_check
    check (
      (status = 'revoked' and revoked_at is not null)
      or (status <> 'revoked')
    )
);

comment on table public.platform_access is
  'TAGORA platform access. Temporary support requires reason + expiration. No silent client-data access.';

create index if not exists platform_access_user_id_idx
  on public.platform_access (user_id);

create index if not exists platform_access_status_idx
  on public.platform_access (status);

create index if not exists platform_access_expires_at_idx
  on public.platform_access (expires_at);

create unique index if not exists platform_access_active_super_admin_uidx
  on public.platform_access (user_id)
  where access_level = 'platform_super_admin' and status = 'active';

drop trigger if exists trg_platform_access_updated_at on public.platform_access;
create trigger trg_platform_access_updated_at
  before update on public.platform_access
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.platform_access enable row level security;
alter table public.platform_access force row level security;

revoke all on table public.platform_access from anon, authenticated;
grant select, insert, update, delete on table public.platform_access to service_role;

-- Append-only audit log (no UPDATE/DELETE grants for clients; revoke DML mutate).
create table if not exists public.platform_access_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null
    references auth.users (id)
    on delete set null,
  target_user_id uuid null
    references auth.users (id)
    on delete set null,
  target_organization_id uuid null
    references public.organizations (id)
    on delete set null,
  platform_access_id uuid null
    references public.platform_access (id)
    on delete set null,
  action text not null,
  reason text not null,
  context jsonb null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint platform_access_audit_action_check
    check (char_length(trim(action)) > 0),
  constraint platform_access_audit_reason_check
    check (char_length(trim(reason)) > 0),
  constraint platform_access_audit_context_object_check
    check (context is null or jsonb_typeof(context) = 'object'),
  constraint platform_access_audit_no_secrets_hint_check
    check (
      context is null
      or (
        not (context ? 'password')
        and not (context ? 'token')
        and not (context ? 'secret')
        and not (context ? 'service_role_key')
      )
    )
);

comment on table public.platform_access_audit is
  'Append-only platform access audit. Do not store secrets in context.';

create index if not exists platform_access_audit_actor_idx
  on public.platform_access_audit (actor_user_id);

create index if not exists platform_access_audit_target_org_idx
  on public.platform_access_audit (target_organization_id);

create index if not exists platform_access_audit_created_at_idx
  on public.platform_access_audit (created_at desc);

-- Block silent mutation of audit history for non-service roles via RLS + revoke.
alter table public.platform_access_audit enable row level security;
alter table public.platform_access_audit force row level security;

revoke all on table public.platform_access_audit from anon, authenticated;
grant select, insert on table public.platform_access_audit to service_role;
-- Intentionally no UPDATE/DELETE grant even for service_role from this migration;
-- service_role may still bypass via superuser-like privileges in Supabase.
-- Application code must treat this table as append-only.
