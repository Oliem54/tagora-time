-- TAGORA HORORA — horora_nexus_access_foundation (local additive only).
-- Server-only mapping + anti-replay receipts + opaque brokered sessions.
-- No public policies. No privileged SQL functions. No Data API exposure.
-- Never stores raw JWT, mailbox, or business permissions.

-- =============================================================================
-- 1) Identity map: nexus_actor_id → existing auth.users.id
-- =============================================================================

create table if not exists public.horora_nexus_identity_map (
  id uuid primary key default gen_random_uuid(),
  nexus_actor_id text not null,
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  disabled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint horora_nexus_identity_map_actor_ck
    check (char_length(btrim(nexus_actor_id)) between 1 and 128)
);

comment on table public.horora_nexus_identity_map is
  'Nexus actor → existing HORORA Auth user. No mailbox lookup. No auto-provision.';

create unique index if not exists horora_nexus_identity_map_actor_active_uidx
  on public.horora_nexus_identity_map (nexus_actor_id)
  where disabled_at is null;

create unique index if not exists horora_nexus_identity_map_auth_user_active_uidx
  on public.horora_nexus_identity_map (auth_user_id)
  where disabled_at is null;

create index if not exists horora_nexus_identity_map_auth_user_id_idx
  on public.horora_nexus_identity_map (auth_user_id);

drop trigger if exists horora_nexus_identity_map_touch_updated_at
  on public.horora_nexus_identity_map;
create trigger horora_nexus_identity_map_touch_updated_at
  before update on public.horora_nexus_identity_map
  for each row execute function public.set_saas_foundation_updated_at();

-- =============================================================================
-- 2) Organization map: nexus_organization_id → organizations.id
-- =============================================================================

create table if not exists public.horora_nexus_organization_map (
  id uuid primary key default gen_random_uuid(),
  nexus_organization_id text not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint horora_nexus_organization_map_nexus_org_ck
    check (char_length(btrim(nexus_organization_id)) between 1 and 128),
  constraint horora_nexus_organization_map_status_ck
    check (status in ('active', 'disabled'))
);

comment on table public.horora_nexus_organization_map is
  'Nexus organization → existing HORORA organization. No automatic org creation.';

create unique index if not exists horora_nexus_organization_map_nexus_org_active_uidx
  on public.horora_nexus_organization_map (nexus_organization_id)
  where status = 'active';

create unique index if not exists horora_nexus_organization_map_org_active_uidx
  on public.horora_nexus_organization_map (organization_id)
  where status = 'active';

create index if not exists horora_nexus_organization_map_organization_id_idx
  on public.horora_nexus_organization_map (organization_id);

drop trigger if exists horora_nexus_organization_map_touch_updated_at
  on public.horora_nexus_organization_map;
create trigger horora_nexus_organization_map_touch_updated_at
  before update on public.horora_nexus_organization_map
  for each row execute function public.set_saas_foundation_updated_at();

-- =============================================================================
-- 3) One-time handoff receipts (jti PK + unique nonce)
-- =============================================================================

create table if not exists public.horora_nexus_handoff_receipts (
  jti text primary key,
  nonce text not null,
  module_key text not null,
  nexus_organization_id text not null,
  nexus_actor_id text not null,
  membership_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint horora_nexus_handoff_receipts_jti_ck
    check (char_length(btrim(jti)) between 1 and 128),
  constraint horora_nexus_handoff_receipts_nonce_ck
    check (char_length(btrim(nonce)) between 1 and 128),
  constraint horora_nexus_handoff_receipts_module_ck
    check (module_key = 'tagora_time'),
  constraint horora_nexus_handoff_receipts_org_ck
    check (char_length(btrim(nexus_organization_id)) between 1 and 128),
  constraint horora_nexus_handoff_receipts_actor_ck
    check (char_length(btrim(nexus_actor_id)) between 1 and 128),
  constraint horora_nexus_handoff_receipts_membership_ck
    check (char_length(btrim(membership_id)) between 1 and 128)
);

comment on table public.horora_nexus_handoff_receipts is
  'Atomic one-time TAGORA_HANDOFF_V1 jti+nonce receipts. No raw JWT, mailbox, or business permissions.';

create unique index if not exists horora_nexus_handoff_receipts_nonce_uidx
  on public.horora_nexus_handoff_receipts (nonce);

create index if not exists horora_nexus_handoff_receipts_org_idx
  on public.horora_nexus_handoff_receipts (nexus_organization_id);

create index if not exists horora_nexus_handoff_receipts_actor_idx
  on public.horora_nexus_handoff_receipts (nexus_actor_id);

create index if not exists horora_nexus_handoff_receipts_expires_at_idx
  on public.horora_nexus_handoff_receipts (expires_at);

-- =============================================================================
-- 4) Brokered local HORORA sessions (opaque cookie). Hash only, never raw token.
-- =============================================================================

create table if not exists public.horora_nexus_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  membership_id uuid not null references public.organization_memberships (id) on delete restrict,
  nexus_actor_id text not null,
  nexus_organization_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint horora_nexus_sessions_token_hash_ck
    check (char_length(btrim(token_hash)) = 64),
  constraint horora_nexus_sessions_expires_ck
    check (expires_at > created_at),
  constraint horora_nexus_sessions_actor_ck
    check (char_length(btrim(nexus_actor_id)) between 1 and 128),
  constraint horora_nexus_sessions_org_ck
    check (char_length(btrim(nexus_organization_id)) between 1 and 128)
);

comment on table public.horora_nexus_sessions is
  'Opaque brokered HORORA sessions after Nexus ALLOW. Stores token hash only. Not a Supabase Auth session.';

create unique index if not exists horora_nexus_sessions_token_hash_uidx
  on public.horora_nexus_sessions (token_hash);

create index if not exists horora_nexus_sessions_auth_user_id_idx
  on public.horora_nexus_sessions (auth_user_id);

create index if not exists horora_nexus_sessions_expires_at_idx
  on public.horora_nexus_sessions (expires_at);

-- =============================================================================
-- RLS fail-closed — service_role only, no public/anon/authenticated grants
-- =============================================================================

alter table public.horora_nexus_identity_map enable row level security;
alter table public.horora_nexus_organization_map enable row level security;
alter table public.horora_nexus_handoff_receipts enable row level security;
alter table public.horora_nexus_sessions enable row level security;

alter table public.horora_nexus_identity_map force row level security;
alter table public.horora_nexus_organization_map force row level security;
alter table public.horora_nexus_handoff_receipts force row level security;
alter table public.horora_nexus_sessions force row level security;

revoke all on table public.horora_nexus_identity_map from public;
revoke all on table public.horora_nexus_identity_map from anon;
revoke all on table public.horora_nexus_identity_map from authenticated;

revoke all on table public.horora_nexus_organization_map from public;
revoke all on table public.horora_nexus_organization_map from anon;
revoke all on table public.horora_nexus_organization_map from authenticated;

revoke all on table public.horora_nexus_handoff_receipts from public;
revoke all on table public.horora_nexus_handoff_receipts from anon;
revoke all on table public.horora_nexus_handoff_receipts from authenticated;

revoke all on table public.horora_nexus_sessions from public;
revoke all on table public.horora_nexus_sessions from anon;
revoke all on table public.horora_nexus_sessions from authenticated;

grant all on table public.horora_nexus_identity_map to service_role;
grant all on table public.horora_nexus_organization_map to service_role;
grant all on table public.horora_nexus_handoff_receipts to service_role;
grant all on table public.horora_nexus_sessions to service_role;
