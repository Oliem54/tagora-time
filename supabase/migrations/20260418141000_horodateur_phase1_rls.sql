alter table if exists public.horodateur_events enable row level security;
alter table if exists public.horodateur_shifts enable row level security;
alter table if exists public.horodateur_current_state enable row level security;
alter table if exists public.horodateur_exceptions enable row level security;

drop policy if exists "horodateur_events_select_phase1" on public.horodateur_events;
create policy "horodateur_events_select_phase1"
  on public.horodateur_events
  for select
  to authenticated
  using (
    (
      exists (
        select 1
        from public.chauffeurs c
        where c.id = horodateur_events.employee_id
          and c.auth_user_id = auth.uid()
      )
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

drop policy if exists "horodateur_shifts_select_phase1" on public.horodateur_shifts;
create policy "horodateur_shifts_select_phase1"
  on public.horodateur_shifts
  for select
  to authenticated
  using (
    (
      exists (
        select 1
        from public.chauffeurs c
        where c.id = horodateur_shifts.employee_id
          and c.auth_user_id = auth.uid()
      )
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

drop policy if exists "horodateur_current_state_select_phase1" on public.horodateur_current_state;
create policy "horodateur_current_state_select_phase1"
  on public.horodateur_current_state
  for select
  to authenticated
  using (
    (
      exists (
        select 1
        from public.chauffeurs c
        where c.id = horodateur_current_state.employee_id
          and c.auth_user_id = auth.uid()
      )
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

drop policy if exists "horodateur_exceptions_select_phase1" on public.horodateur_exceptions;
create policy "horodateur_exceptions_select_phase1"
  on public.horodateur_exceptions
  for select
  to authenticated
  using (
    (
      exists (
        select 1
        from public.chauffeurs c
        where c.id = horodateur_exceptions.employee_id
          and c.auth_user_id = auth.uid()
      )
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

drop policy if exists "horodateur_events_insert_phase1" on public.horodateur_events;
drop policy if exists "horodateur_events_update_phase1" on public.horodateur_events;
drop policy if exists "horodateur_events_delete_phase1" on public.horodateur_events;
drop policy if exists "horodateur_shifts_insert_phase1" on public.horodateur_shifts;
drop policy if exists "horodateur_shifts_update_phase1" on public.horodateur_shifts;
drop policy if exists "horodateur_shifts_delete_phase1" on public.horodateur_shifts;
drop policy if exists "horodateur_current_state_insert_phase1" on public.horodateur_current_state;
drop policy if exists "horodateur_current_state_update_phase1" on public.horodateur_current_state;
drop policy if exists "horodateur_current_state_delete_phase1" on public.horodateur_current_state;
drop policy if exists "horodateur_exceptions_insert_phase1" on public.horodateur_exceptions;
drop policy if exists "horodateur_exceptions_update_phase1" on public.horodateur_exceptions;
drop policy if exists "horodateur_exceptions_delete_phase1" on public.horodateur_exceptions;
