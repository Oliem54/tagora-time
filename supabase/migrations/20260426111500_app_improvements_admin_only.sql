alter table public.app_improvements enable row level security;

drop policy if exists app_improvements_select_authenticated on public.app_improvements;
drop policy if exists app_improvements_insert_authenticated on public.app_improvements;
drop policy if exists app_improvements_update_direction on public.app_improvements;
drop policy if exists app_improvements_select_admin_only on public.app_improvements;
drop policy if exists app_improvements_insert_admin_only on public.app_improvements;
drop policy if exists app_improvements_update_admin_only on public.app_improvements;

create policy app_improvements_select_admin_only
  on public.app_improvements
  for select
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
  );

create policy app_improvements_insert_admin_only
  on public.app_improvements
  for insert
  to authenticated
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
  );

create policy app_improvements_update_admin_only
  on public.app_improvements
  for update
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
  )
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
  );
