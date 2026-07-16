-- ============================================================
-- H4-B2 forward-only — organization identities (lot 2/3)
--
-- Scope:
--   public.organization_memberships
--   public.organization_invitations
--   public.enforce_organization_has_owner()
--   associated triggers / indexes / RLS / grants
--
-- Hardening (Martin D1/D2):
--   organization_id immutable after INSERT
--   last active organization_owner protected
--   parent organizations row locked FOR UPDATE
--   SECURITY INVOKER + search_path = pg_catalog
--   REVOKE EXECUTE from PUBLIC / anon / authenticated
--   GRANT EXECUTE to service_role only
--
-- Forbidden: platform_access*, seed, backfill, real memberships,
-- real invitations, tokens, Auth changes, business ALTER,
-- H4-B3, H5-F5, repair of original 20260712220x00 versions.
-- Idempotent with local reset where 20260712220300/20400 already ran.
-- ============================================================

begin;

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  user_id uuid not null
    references auth.users (id)
    on delete restrict,
  role text not null,
  status text not null default 'invited',
  is_default boolean not null default false,
  joined_at timestamptz null,
  suspended_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_memberships_role_check
    check (
      role in (
        'organization_owner',
        'organization_admin',
        'direction',
        'employe'
      )
    ),
  constraint organization_memberships_status_check
    check (status in ('active', 'suspended', 'invited')),
  constraint organization_memberships_suspended_consistency_check
    check (
      (status = 'suspended' and suspended_at is not null)
      or (status <> 'suspended' and suspended_at is null)
    )
);

comment on table public.organization_memberships is
  'H4-B2: Org-scoped roles. Never store platform_super_admin/platform_support here. organization_id immutable.';

create unique index if not exists organization_memberships_org_user_uidx
  on public.organization_memberships (organization_id, user_id);

create unique index if not exists organization_memberships_user_default_uidx
  on public.organization_memberships (user_id)
  where is_default = true;

create index if not exists organization_memberships_user_id_idx
  on public.organization_memberships (user_id);

create index if not exists organization_memberships_org_role_idx
  on public.organization_memberships (organization_id, role);

create index if not exists organization_memberships_org_status_idx
  on public.organization_memberships (organization_id, status);

create or replace function public.enforce_organization_has_owner()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_org_id uuid;
  v_remaining integer;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception
        'organization_memberships.organization_id is immutable after insert'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_org_id := old.organization_id;
    if old.role = 'organization_owner' and old.status = 'active' then
      perform 1
      from public.organizations o
      where o.id = v_org_id
      for update;

      select count(*)::integer
        into v_remaining
      from public.organization_memberships m
      where m.organization_id = v_org_id
        and m.role = 'organization_owner'
        and m.status = 'active'
        and m.id <> old.id;

      if v_remaining = 0 then
        raise exception
          'organization must keep at least one active organization_owner'
          using errcode = 'check_violation';
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Protect source organization using old.organization_id only.
    v_org_id := old.organization_id;
    if old.role = 'organization_owner'
       and old.status = 'active'
       and (
         new.role is distinct from 'organization_owner'
         or new.status is distinct from 'active'
       )
    then
      perform 1
      from public.organizations o
      where o.id = v_org_id
      for update;

      select count(*)::integer
        into v_remaining
      from public.organization_memberships m
      where m.organization_id = v_org_id
        and m.role = 'organization_owner'
        and m.status = 'active'
        and m.id <> old.id;

      if v_remaining = 0 then
        raise exception
          'organization must keep at least one active organization_owner'
          using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

comment on function public.enforce_organization_has_owner() is
  'H4-B2: blocks last active owner removal/demotion/suspension; rejects organization_id changes; locks public.organizations FOR UPDATE. SECURITY INVOKER. search_path=pg_catalog.';

revoke all on function public.enforce_organization_has_owner() from public;
revoke all on function public.enforce_organization_has_owner() from anon;
revoke all on function public.enforce_organization_has_owner() from authenticated;
grant execute on function public.enforce_organization_has_owner() to service_role;

drop trigger if exists trg_organization_memberships_enforce_owner
  on public.organization_memberships;
create trigger trg_organization_memberships_enforce_owner
  before update or delete on public.organization_memberships
  for each row execute function public.enforce_organization_has_owner();

drop trigger if exists trg_organization_memberships_updated_at
  on public.organization_memberships;
create trigger trg_organization_memberships_updated_at
  before update on public.organization_memberships
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.organization_memberships enable row level security;
alter table public.organization_memberships force row level security;

revoke all on table public.organization_memberships from public;
revoke all on table public.organization_memberships from anon;
revoke all on table public.organization_memberships from authenticated;
grant select, insert, update, delete on table public.organization_memberships to service_role;

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  email text not null,
  proposed_role text not null,
  token_hash text not null,
  status text not null default 'pending',
  invited_by uuid null
    references auth.users (id)
    on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_invitations_email_format_check
    check (email = lower(trim(email)) and position('@' in email) > 1),
  constraint organization_invitations_proposed_role_check
    check (
      proposed_role in (
        'organization_owner',
        'organization_admin',
        'direction',
        'employe'
      )
    ),
  constraint organization_invitations_status_check
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  constraint organization_invitations_token_hash_check
    check (char_length(token_hash) >= 32),
  constraint organization_invitations_accepted_consistency_check
    check (
      (status = 'accepted' and accepted_at is not null)
      or (status <> 'accepted' and accepted_at is null)
    ),
  constraint organization_invitations_revoked_consistency_check
    check (
      (status = 'revoked' and revoked_at is not null)
      or (status <> 'revoked')
    )
);

comment on table public.organization_invitations is
  'H4-B2: Org invitations. Store token_hash only; never store raw invitation tokens.';

create unique index if not exists organization_invitations_pending_email_uidx
  on public.organization_invitations (organization_id, email)
  where status = 'pending';

create unique index if not exists organization_invitations_token_hash_uidx
  on public.organization_invitations (token_hash);

create index if not exists organization_invitations_org_id_idx
  on public.organization_invitations (organization_id);

create index if not exists organization_invitations_expires_at_idx
  on public.organization_invitations (expires_at);

drop trigger if exists trg_organization_invitations_updated_at
  on public.organization_invitations;
create trigger trg_organization_invitations_updated_at
  before update on public.organization_invitations
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.organization_invitations enable row level security;
alter table public.organization_invitations force row level security;

revoke all on table public.organization_invitations from public;
revoke all on table public.organization_invitations from anon;
revoke all on table public.organization_invitations from authenticated;
grant select, insert, update, delete on table public.organization_invitations to service_role;

commit;
