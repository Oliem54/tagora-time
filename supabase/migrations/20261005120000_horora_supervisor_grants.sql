-- HORORA supervisor grants. Local migration file only.
-- Do not apply this file to local, Staging, or Production Supabase.
-- This is not a portal role and does not change organization_memberships.role.
-- current_app_role() is unchanged. No open RLS policy.

begin;

create table if not exists public.horora_supervisor_grants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  membership_id uuid not null references public.organization_memberships (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  organization_company_id uuid not null references public.organization_companies (id) on delete restrict,
  effectifs_department_key text not null,
  capabilities text[] not null,
  status text not null default 'inactive',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint horora_supervisor_grants_department_ck
    check (char_length(btrim(effectifs_department_key)) between 1 and 80),
  constraint horora_supervisor_grants_status_ck
    check (status in ('active', 'inactive')),
  constraint horora_supervisor_grants_capabilities_ck
    check (
      cardinality(capabilities) > 0
      and capabilities <@ array['view_team', 'approve_anomalies', 'correct_time']::text[]
    )
);

comment on table public.horora_supervisor_grants is
  'Explicit HORORA supervisor grant for an existing employe membership. Not an AppRole. Not a membership role. Service role only.';

create unique index if not exists horora_supervisor_grants_active_scope_uidx
  on public.horora_supervisor_grants (
    auth_user_id,
    organization_id,
    organization_company_id,
    effectifs_department_key
  )
  where status = 'active';

create index if not exists horora_supervisor_grants_auth_user_id_idx
  on public.horora_supervisor_grants (auth_user_id);

create index if not exists horora_supervisor_grants_membership_id_idx
  on public.horora_supervisor_grants (membership_id);

drop trigger if exists horora_supervisor_grants_touch_updated_at
  on public.horora_supervisor_grants;
create trigger horora_supervisor_grants_touch_updated_at
  before update on public.horora_supervisor_grants
  for each row execute function public.set_saas_foundation_updated_at();

alter table public.horora_supervisor_grants enable row level security;
alter table public.horora_supervisor_grants force row level security;

revoke all on table public.horora_supervisor_grants from public;
revoke all on table public.horora_supervisor_grants from anon;
revoke all on table public.horora_supervisor_grants from authenticated;

grant all on table public.horora_supervisor_grants to service_role;

commit;
