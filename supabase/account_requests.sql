create extension if not exists pgcrypto;

create table if not exists public.app_permissions (
  slug text primary key,
  label text not null,
  module_key text not null,
  description text,
  sort_order integer not null default 0
);

insert into public.app_permissions (slug, label, module_key, description, sort_order)
values
  ('documents', 'Documents', 'documents', 'Acces aux documents terrain, medias et confirmations.', 10),
  ('dossiers', 'Dossiers', 'dossiers', 'Acces aux dossiers terrain et a leurs notes.', 20),
  ('terrain', 'Terrain', 'terrain', 'Acces aux sorties terrain et operations reliees.', 30),
  ('livraisons', 'Livraisons', 'livraisons', 'Acces a la planification et au suivi des livraisons.', 40),
  ('ressources', 'Ressources', 'ressources', 'Acces aux ressources direction comme vehicules et remorques.', 50)
on conflict (slug) do update
set
  label = excluded.label,
  module_key = excluded.module_key,
  description = excluded.description,
  sort_order = excluded.sort_order;

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  company text,
  portal_source text not null check (portal_source in ('employe', 'direction')),
  requested_role text not null check (requested_role in ('employe', 'direction')),
  requested_permissions text[] not null default '{}',
  message text,
  status text not null default 'pending' check (status in ('pending', 'invited', 'active', 'refused', 'error')),
  assigned_role text check (assigned_role in ('employe', 'direction')),
  assigned_permissions text[] not null default '{}',
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  invited_user_id uuid,
  review_lock_token uuid,
  review_started_at timestamptz,
  last_error text,
  audit_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.account_requests
  add column if not exists review_lock_token uuid,
  add column if not exists review_started_at timestamptz,
  add column if not exists last_error text,
  add column if not exists audit_log jsonb not null default '[]'::jsonb;

alter table public.account_requests
  alter column requested_permissions set default '{}',
  alter column assigned_permissions set default '{}',
  alter column audit_log set default '[]'::jsonb;

alter table public.account_requests
  drop constraint if exists account_requests_status_check;

alter table public.account_requests
  add constraint account_requests_status_check
  check (status in ('pending', 'invited', 'active', 'refused', 'error'));

create unique index if not exists uq_account_requests_pending_email
  on public.account_requests (lower(email))
  where status = 'pending';

create table if not exists public.account_request_rate_limits (
  scope text not null,
  identifier text not null,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default timezone('utc', now()),
  blocked_until timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (scope, identifier)
);

alter table public.account_requests enable row level security;
alter table public.app_permissions enable row level security;
alter table public.account_request_rate_limits enable row level security;

drop policy if exists "anon_insert_account_requests" on public.account_requests;
create policy "anon_insert_account_requests"
  on public.account_requests
  for insert
  to anon, authenticated
  with check (status = 'pending');

drop policy if exists "deny_read_account_requests" on public.account_requests;
create policy "deny_read_account_requests"
  on public.account_requests
  for select
  to anon, authenticated
  using (false);

drop policy if exists "deny_update_account_requests" on public.account_requests;
create policy "deny_update_account_requests"
  on public.account_requests
  for update
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "read_app_permissions" on public.app_permissions;
create policy "read_app_permissions"
  on public.app_permissions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "deny_access_account_request_rate_limits" on public.account_request_rate_limits;
create policy "deny_access_account_request_rate_limits"
  on public.account_request_rate_limits
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.consume_account_request_rate_limit(
  p_scope text,
  p_identifier text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.account_request_rate_limits%rowtype;
  now_utc timestamptz := timezone('utc', now());
  next_window_start timestamptz := now_utc;
  next_blocked_until timestamptz := null;
begin
  insert into public.account_request_rate_limits (scope, identifier, attempt_count, window_started_at, blocked_until, updated_at)
  values (p_scope, p_identifier, 0, now_utc, null, now_utc)
  on conflict (scope, identifier) do nothing;

  select *
  into current_row
  from public.account_request_rate_limits
  where scope = p_scope and identifier = p_identifier
  for update;

  if current_row.blocked_until is not null and current_row.blocked_until > now_utc then
    return query
    select false, greatest(1, ceil(extract(epoch from (current_row.blocked_until - now_utc)))::integer);
    return;
  end if;

  if extract(epoch from (now_utc - current_row.window_started_at)) > p_window_seconds then
    current_row.attempt_count := 0;
    current_row.window_started_at := now_utc;
    current_row.blocked_until := null;
  end if;

  current_row.attempt_count := current_row.attempt_count + 1;

  if current_row.attempt_count > p_max_attempts then
    next_blocked_until := now_utc + make_interval(secs => p_block_seconds);
  end if;

  update public.account_request_rate_limits
  set
    attempt_count = current_row.attempt_count,
    window_started_at = current_row.window_started_at,
    blocked_until = next_blocked_until,
    updated_at = now_utc
  where scope = p_scope and identifier = p_identifier;

  if next_blocked_until is not null then
    return query
    select false, greatest(1, ceil(extract(epoch from (next_blocked_until - now_utc)))::integer);
    return;
  end if;

  return query select true, 0;
end;
$$;

grant execute on function public.consume_account_request_rate_limit(text, text, integer, integer, integer)
to anon, authenticated;
