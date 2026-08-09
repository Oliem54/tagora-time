-- ============================================================
-- H4-B3 forward-only — platform access + append-only audit (lot 3/3)
--
-- Scope:
--   public.platform_access
--   public.platform_access_audit
--   public.prevent_platform_access_audit_mutation()
--   associated triggers / indexes / RLS / grants
--
-- Hardening (Martin D2/D3):
--   SECURITY INVOKER + search_path = pg_catalog
--   audit: SELECT/INSERT only for service_role
--   audit: trigger blocks UPDATE/DELETE/TRUNCATE
--   REVOKE PUBLIC/anon/authenticated; no client EXECUTE
--
-- Forbidden: seed, backfill, real platform access rows, real audit
-- rows, Auth/Storage/business ALTER, H5-F5, modification of B1/B2.
-- Idempotent with local reset where 20260712220500 already ran.
-- ============================================================

begin;

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
  'H4-B3: TAGORA platform access. Temporary support requires reason + expiration. No silent client-data access.';

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

revoke all on table public.platform_access from public;
revoke all on table public.platform_access from anon;
revoke all on table public.platform_access from authenticated;
revoke all on table public.platform_access from service_role;
grant select, insert, update, delete on table public.platform_access to service_role;

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
  'H4-B3: Append-only platform access audit. Do not store secrets in context. Mutations blocked by trigger + grants.';

create index if not exists platform_access_audit_actor_idx
  on public.platform_access_audit (actor_user_id);

create index if not exists platform_access_audit_target_org_idx
  on public.platform_access_audit (target_organization_id);

create index if not exists platform_access_audit_created_at_idx
  on public.platform_access_audit (created_at desc);

create or replace function public.prevent_platform_access_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'platform_access_audit is append-only'
    using errcode = 'check_violation';
end;
$$;

comment on function public.prevent_platform_access_audit_mutation() is
  'H4-B3: blocks UPDATE/DELETE/TRUNCATE on platform_access_audit. SECURITY INVOKER. search_path=pg_catalog.';

revoke all on function public.prevent_platform_access_audit_mutation() from public;
revoke all on function public.prevent_platform_access_audit_mutation() from anon;
revoke all on function public.prevent_platform_access_audit_mutation() from authenticated;
grant execute on function public.prevent_platform_access_audit_mutation() to service_role;

drop trigger if exists trg_platform_access_audit_no_update_delete
  on public.platform_access_audit;
create trigger trg_platform_access_audit_no_update_delete
  before update or delete on public.platform_access_audit
  for each row execute function public.prevent_platform_access_audit_mutation();

drop trigger if exists trg_platform_access_audit_no_truncate
  on public.platform_access_audit;
create trigger trg_platform_access_audit_no_truncate
  before truncate on public.platform_access_audit
  for each statement execute function public.prevent_platform_access_audit_mutation();

alter table public.platform_access_audit enable row level security;
alter table public.platform_access_audit force row level security;

revoke all on table public.platform_access_audit from public;
revoke all on table public.platform_access_audit from anon;
revoke all on table public.platform_access_audit from authenticated;
revoke all on table public.platform_access_audit from service_role;
grant select, insert on table public.platform_access_audit to service_role;

commit;
