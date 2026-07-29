create table if not exists public.user_role_audit_logs (
  id bigserial primary key,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_employee_id bigint null,
  old_role text not null,
  new_role text not null,
  changed_by_user_id uuid null references auth.users(id) on delete set null,
  changed_by_email text null,
  reason text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_role_audit_logs_target_created
  on public.user_role_audit_logs (target_user_id, created_at desc);

create index if not exists idx_user_role_audit_logs_changed_by_created
  on public.user_role_audit_logs (changed_by_user_id, created_at desc);

alter table public.user_role_audit_logs enable row level security;

drop policy if exists "user_role_audit_logs_select_admin_only" on public.user_role_audit_logs;
create policy "user_role_audit_logs_select_admin_only"
  on public.user_role_audit_logs
  for select
  to authenticated
  using (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) = 'admin'
  );

drop policy if exists "user_role_audit_logs_insert_admin_only" on public.user_role_audit_logs;
create policy "user_role_audit_logs_insert_admin_only"
  on public.user_role_audit_logs
  for insert
  to authenticated
  with check (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) = 'admin'
  );
