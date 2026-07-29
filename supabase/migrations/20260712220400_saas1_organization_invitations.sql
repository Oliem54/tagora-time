-- SaaS 1B.1 — organization_invitations (token_hash only, never raw token)

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
  'Org invitations. Store token_hash only; never store raw invitation tokens.';

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

revoke all on table public.organization_invitations from anon, authenticated;
grant select, insert, update, delete on table public.organization_invitations to service_role;
