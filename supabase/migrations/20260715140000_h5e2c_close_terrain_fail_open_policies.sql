-- ============================================================
-- H5-E2C forward-only — close terrain / timeclock fail-open RLS
--
-- Removes public true fail-open on:
--   chauffeurs ("allow all "),
--   sorties_terrain ("allow all "),
--   horodateur_events_{select,insert,update,delete}
--
-- Recreates authenticated SELECT (Phase1+admin) for Horodateur tables;
-- adds secure chauffeurs SELECT; secure sorties_terrain CRUD.
--
-- Forbidden: helpers, views, grants, FORCE RLS, DISABLE RLS, data,
-- DROP COLUMN, H5-E2B/D, H5-F, H4, historical replay, public/anon policies.
-- ============================================================

begin;

do $$
declare
  missing text;
begin
  select string_agg(t, ', ' order by t) into missing
  from (
    values
      ('horodateur_events'),
      ('horodateur_shifts'),
      ('horodateur_current_state'),
      ('horodateur_exceptions'),
      ('chauffeurs'),
      ('sorties_terrain')
  ) as req(t)
  where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception 'H5-E2C STOP: missing tables: %', missing;
  end if;
end
$$;

alter table public.horodateur_events enable row level security;
alter table public.horodateur_shifts enable row level security;
alter table public.horodateur_current_state enable row level security;
alter table public.horodateur_exceptions enable row level security;
alter table public.chauffeurs enable row level security;
alter table public.sorties_terrain enable row level security;

-- Exact fail-open names proven on staging (trailing space on allow all)
drop policy if exists "horodateur_events_select" on public.horodateur_events;
drop policy if exists "horodateur_events_insert" on public.horodateur_events;
drop policy if exists "horodateur_events_update" on public.horodateur_events;
drop policy if exists "horodateur_events_delete" on public.horodateur_events;
drop policy if exists "allow all " on public.chauffeurs;
drop policy if exists "allow all " on public.sorties_terrain;

-- Legacy employee-only selects (staging) and Phase1 selects (local) before recreate
drop policy if exists "events_select" on public.horodateur_events;
drop policy if exists "shifts_select" on public.horodateur_shifts;
drop policy if exists "state_select" on public.horodateur_current_state;
drop policy if exists "exceptions_select" on public.horodateur_exceptions;
drop policy if exists "horodateur_events_select_phase1" on public.horodateur_events;
drop policy if exists "horodateur_shifts_select_phase1" on public.horodateur_shifts;
drop policy if exists "horodateur_current_state_select_phase1" on public.horodateur_current_state;
drop policy if exists "horodateur_exceptions_select_phase1" on public.horodateur_exceptions;

-- Idempotent E2C names
drop policy if exists "chauffeurs_select_h5e2c" on public.chauffeurs;
drop policy if exists "sorties_terrain_select_h5e2c" on public.sorties_terrain;
drop policy if exists "sorties_terrain_insert_h5e2c" on public.sorties_terrain;
drop policy if exists "sorties_terrain_update_h5e2c" on public.sorties_terrain;
drop policy if exists "sorties_terrain_delete_h5e2c" on public.sorties_terrain;

-- Horodateur SELECT only (no authenticated writes)
create policy "horodateur_events_select_phase1"
  on public.horodateur_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chauffeurs c
      where c.id = horodateur_events.employee_id
        and c.auth_user_id = auth.uid()
    )
    or public.current_app_role() = 'admin'
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

create policy "horodateur_shifts_select_phase1"
  on public.horodateur_shifts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chauffeurs c
      where c.id = horodateur_shifts.employee_id
        and c.auth_user_id = auth.uid()
    )
    or public.current_app_role() = 'admin'
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

create policy "horodateur_current_state_select_phase1"
  on public.horodateur_current_state
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chauffeurs c
      where c.id = horodateur_current_state.employee_id
        and c.auth_user_id = auth.uid()
    )
    or public.current_app_role() = 'admin'
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

create policy "horodateur_exceptions_select_phase1"
  on public.horodateur_exceptions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chauffeurs c
      where c.id = horodateur_exceptions.employee_id
        and c.auth_user_id = auth.uid()
    )
    or public.current_app_role() = 'admin'
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

create policy "chauffeurs_select_h5e2c"
  on public.chauffeurs
  for select
  to authenticated
  using (
    auth_user_id = auth.uid()
    or public.current_app_role() = 'admin'
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

create policy "sorties_terrain_select_h5e2c"
  on public.sorties_terrain
  for select
  to authenticated
  using (
    (
      user_id = auth.uid()
      and public.has_app_permission('terrain')
    )
    or public.current_app_role() = 'admin'
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

create policy "sorties_terrain_insert_h5e2c"
  on public.sorties_terrain
  for insert
  to authenticated
  with check (
    (
      user_id = auth.uid()
      and public.has_app_permission('terrain')
    )
    or public.current_app_role() = 'admin'
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

create policy "sorties_terrain_update_h5e2c"
  on public.sorties_terrain
  for update
  to authenticated
  using (
    (
      user_id = auth.uid()
      and public.has_app_permission('terrain')
    )
    or public.current_app_role() = 'admin'
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  )
  with check (
    (
      user_id = auth.uid()
      and public.has_app_permission('terrain')
    )
    or public.current_app_role() = 'admin'
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

create policy "sorties_terrain_delete_h5e2c"
  on public.sorties_terrain
  for delete
  to authenticated
  using (
    public.current_app_role() = 'admin'
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

commit;
