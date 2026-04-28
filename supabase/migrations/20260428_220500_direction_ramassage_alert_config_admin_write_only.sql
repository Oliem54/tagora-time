drop policy if exists "direction_ramassage_alert_config_write_direction_admin" on public.direction_ramassage_alert_config;

create policy "direction_ramassage_alert_config_write_admin_only"
  on public.direction_ramassage_alert_config
  for all
  to authenticated
  using (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) = 'admin'
  )
  with check (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) = 'admin'
  );
