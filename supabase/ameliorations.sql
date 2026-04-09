create extension if not exists pgcrypto;

create table if not exists public.app_improvements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  submitted_role text not null default coalesce(public.current_app_role(), 'inconnu'),
  module text not null,
  title text not null,
  description text not null,
  priority text not null check (priority in ('Faible', 'Moyenne', 'Elevee')),
  status text not null default 'nouveau' check (
    status in ('nouveau', 'en_cours', 'planifie', 'complete', 'archive')
  ),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_app_improvements_user_date
  on public.app_improvements (user_id, created_at desc);

create index if not exists idx_app_improvements_status_date
  on public.app_improvements (status, created_at desc);

create index if not exists idx_app_improvements_priority_date
  on public.app_improvements (priority, created_at desc);

alter table if exists public.app_improvements enable row level security;

drop policy if exists "app_improvements_select_policy" on public.app_improvements;
create policy "app_improvements_select_policy"
  on public.app_improvements
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_direction_user()
  );

drop policy if exists "app_improvements_insert_policy" on public.app_improvements;
create policy "app_improvements_insert_policy"
  on public.app_improvements
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "app_improvements_update_policy" on public.app_improvements;
create policy "app_improvements_update_policy"
  on public.app_improvements
  for update
  to authenticated
  using (public.is_direction_user())
  with check (public.is_direction_user());

drop policy if exists "app_improvements_delete_policy" on public.app_improvements;
create policy "app_improvements_delete_policy"
  on public.app_improvements
  for delete
  to authenticated
  using (public.is_direction_user());
