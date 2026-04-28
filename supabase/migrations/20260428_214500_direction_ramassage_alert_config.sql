create table if not exists public.direction_ramassage_alert_config (
  config_key text primary key default 'default',
  delay_days integer not null default 2,
  warning_days integer not null default 1,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.direction_ramassage_alert_config (config_key, delay_days, warning_days, email_enabled, sms_enabled)
values ('default', 2, 1, true, true)
on conflict (config_key) do nothing;

alter table public.direction_ramassage_alert_config enable row level security;

drop policy if exists "direction_ramassage_alert_config_select_direction_admin" on public.direction_ramassage_alert_config;
create policy "direction_ramassage_alert_config_select_direction_admin"
  on public.direction_ramassage_alert_config
  for select
  to authenticated
  using (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) in ('direction', 'admin', 'manager')
  );

drop policy if exists "direction_ramassage_alert_config_write_direction_admin" on public.direction_ramassage_alert_config;
create policy "direction_ramassage_alert_config_write_direction_admin"
  on public.direction_ramassage_alert_config
  for all
  to authenticated
  using (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) in ('direction', 'admin', 'manager')
  )
  with check (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) in ('direction', 'admin', 'manager')
  );
