-- Local proposal only. Do not apply in this change.
-- Durable HORORA consent for a Nexus role assignment.
-- Service role only. No browser policies. No update or delete grant.

create table if not exists public.horora_nexus_role_acknowledgements (
  id text primary key,
  operation_id text not null,
  module_role_assignment_id text not null,
  user_module_access_id text not null,
  role_key text not null,
  membership_id uuid not null references public.organization_memberships (id) on delete restrict,
  admin_user_id text not null,
  nexus_actor_id text not null,
  nexus_organization_id text not null,
  nexus_tenant_id text not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  environment text not null,
  operation text not null,
  catalog_version text not null,
  assignment_version bigint not null,
  acknowledged_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint horora_nexus_role_ack_id_ck
    check (char_length(btrim(id)) between 8 and 128),
  constraint horora_nexus_role_ack_operation_id_ck
    check (char_length(btrim(operation_id)) between 1 and 128),
  constraint horora_nexus_role_ack_assignment_ck
    check (char_length(btrim(module_role_assignment_id)) between 1 and 128),
  constraint horora_nexus_role_ack_access_ck
    check (char_length(btrim(user_module_access_id)) between 1 and 128),
  constraint horora_nexus_role_ack_role_ck
    check (role_key in ('employe', 'direction')),
  constraint horora_nexus_role_ack_admin_ck
    check (char_length(btrim(admin_user_id)) between 1 and 128),
  constraint horora_nexus_role_ack_actor_ck
    check (char_length(btrim(nexus_actor_id)) between 1 and 128),
  constraint horora_nexus_role_ack_nexus_org_ck
    check (char_length(btrim(nexus_organization_id)) between 1 and 128),
  constraint horora_nexus_role_ack_nexus_tenant_ck
    check (
      nexus_tenant_id = btrim(nexus_tenant_id)
      and char_length(nexus_tenant_id) between 1 and 128
    ),
  constraint horora_nexus_role_ack_environment_ck
    check (environment in ('local', 'test', 'staging')),
  constraint horora_nexus_role_ack_operation_ck
    check (operation in ('ASSIGN', 'CHANGE')),
  constraint horora_nexus_role_ack_catalog_ck
    check (catalog_version = 'horora-role-catalog-v1'),
  constraint horora_nexus_role_ack_version_ck
    check (assignment_version > 0)
);

comment on table public.horora_nexus_role_acknowledgements is
  'HORORA consent for one Nexus role assignment. Not a session role and not a handoff claim.';

-- Global uniqueness: the same operation or assignment id cannot be replayed under another tenant.
create unique index if not exists horora_nexus_role_ack_operation_uidx
  on public.horora_nexus_role_acknowledgements (operation_id);

create unique index if not exists horora_nexus_role_ack_assignment_uidx
  on public.horora_nexus_role_acknowledgements (module_role_assignment_id);

create index if not exists horora_nexus_role_ack_tenant_org_idx
  on public.horora_nexus_role_acknowledgements (nexus_tenant_id, organization_id);

alter table public.horora_nexus_role_acknowledgements enable row level security;
alter table public.horora_nexus_role_acknowledgements force row level security;

revoke all on table public.horora_nexus_role_acknowledgements from public;
revoke all on table public.horora_nexus_role_acknowledgements from anon;
revoke all on table public.horora_nexus_role_acknowledgements from authenticated;

grant select, insert on table public.horora_nexus_role_acknowledgements to service_role;
