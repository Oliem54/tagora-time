-- SaaS 1B.1 — organization_memberships
-- platform_super_admin is forbidden here (platform_access table only).

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
  'Org-scoped roles. Never store platform_super_admin here.';

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

-- Prevent removing the last active organization_owner without breaking first insert.
create or replace function public.enforce_organization_has_owner()
returns trigger
language plpgsql
as $$
declare
  v_org_id uuid;
  v_remaining integer;
begin
  if tg_op = 'DELETE' then
    v_org_id := old.organization_id;
    if old.role = 'organization_owner' and old.status = 'active' then
      select count(*)::integer
        into v_remaining
      from public.organization_memberships m
      where m.organization_id = v_org_id
        and m.role = 'organization_owner'
        and m.status = 'active'
        and m.id <> old.id;

      if v_remaining = 0 then
        raise exception
          'organization % must keep at least one active organization_owner',
          v_org_id
          using errcode = 'check_violation';
      end if;
    end if;
    return old;
  end if;

  -- UPDATE path: demote/suspend/change role of an active owner
  if tg_op = 'UPDATE' then
    v_org_id := new.organization_id;
    if old.role = 'organization_owner'
       and old.status = 'active'
       and (
         new.role is distinct from 'organization_owner'
         or new.status is distinct from 'active'
       )
    then
      select count(*)::integer
        into v_remaining
      from public.organization_memberships m
      where m.organization_id = v_org_id
        and m.role = 'organization_owner'
        and m.status = 'active'
        and m.id <> old.id;

      if v_remaining = 0 then
        raise exception
          'organization % must keep at least one active organization_owner',
          v_org_id
          using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

comment on function public.enforce_organization_has_owner() is
  'Allows creating the first owner; blocks removing/suspending the last active owner.';

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

revoke all on table public.organization_memberships from anon, authenticated;
grant select, insert, update, delete on table public.organization_memberships to service_role;
