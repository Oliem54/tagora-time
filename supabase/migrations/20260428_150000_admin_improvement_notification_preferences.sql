-- Préférences de notification (nouvelles améliorations) par compte admin.
-- Une ligne par admin (user_id = auth.users.id). Absence de ligne = défauts applicatifs côté app.

create table if not exists public.admin_improvement_notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  improvements_email_notifications_enabled boolean not null default true,
  improvements_sms_notifications_enabled boolean not null default false,
  improvements_notification_email text,
  improvements_notification_phone text,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_admin_improvement_notif_updated_at
  on public.admin_improvement_notification_preferences (updated_at desc);

alter table public.admin_improvement_notification_preferences enable row level security;

drop policy if exists "admin_improvement_notif_select_own"
  on public.admin_improvement_notification_preferences;
create policy "admin_improvement_notif_select_own"
  on public.admin_improvement_notification_preferences
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) = 'admin'
  );

drop policy if exists "admin_improvement_notif_insert_own"
  on public.admin_improvement_notification_preferences;
create policy "admin_improvement_notif_insert_own"
  on public.admin_improvement_notification_preferences
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) = 'admin'
  );

drop policy if exists "admin_improvement_notif_update_own"
  on public.admin_improvement_notification_preferences;
create policy "admin_improvement_notif_update_own"
  on public.admin_improvement_notification_preferences
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) = 'admin'
  )
  with check (
    auth.uid() = user_id
    and coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) = 'admin'
  );

comment on table public.admin_improvement_notification_preferences is
  'Préférences admin pour alertes nouvelles entrées app_improvements (email/SMS).';
