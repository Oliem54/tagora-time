-- Canonical minimal migration for horodateur_events.
-- Goals:
-- 1) Guarantee canonical columns exist (occurred_at, notes, employee_id).
-- 2) Backfill from legacy aliases when present (event_time, note, user_id).
-- 3) Keep legacy aliases in place for transition (no destructive changes).

alter table if exists public.horodateur_events
  add column if not exists occurred_at timestamptz,
  add column if not exists notes text,
  add column if not exists employee_id bigint,
  add column if not exists status text not null default 'normal',
  add column if not exists related_event_id uuid,
  add column if not exists work_date date,
  add column if not exists week_start_date date;

do $$
declare
  has_created_at boolean;
  has_event_time boolean;
  has_note boolean;
  has_user_id boolean;
  has_auth_user_id boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'horodateur_events'
      and column_name = 'created_at'
  ) into has_created_at;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'horodateur_events'
      and column_name = 'event_time'
  ) into has_event_time;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'horodateur_events'
      and column_name = 'note'
  ) into has_note;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'horodateur_events'
      and column_name = 'user_id'
  ) into has_user_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chauffeurs'
      and column_name = 'auth_user_id'
  ) into has_auth_user_id;

  if has_event_time then
    execute $sql$
      update public.horodateur_events
      set occurred_at = event_time
      where occurred_at is null
        and event_time is not null
    $sql$;
  end if;

  if has_created_at then
    execute $sql$
      update public.horodateur_events
      set occurred_at = created_at
      where occurred_at is null
        and created_at is not null
    $sql$;
  end if;

  update public.horodateur_events
  set occurred_at = timezone('utc', now())
  where occurred_at is null;

  if has_note then
    execute $sql$
      update public.horodateur_events
      set notes = note
      where (notes is null or btrim(notes) = '')
        and note is not null
        and btrim(note) <> ''
    $sql$;
  end if;

  if has_user_id and has_auth_user_id then
    execute $sql$
      update public.horodateur_events he
      set employee_id = c.id
      from public.chauffeurs c
      where he.employee_id is null
        and he.user_id is not null
        and c.auth_user_id = he.user_id
    $sql$;
  end if;

  update public.horodateur_events
  set work_date = timezone('America/Montreal', occurred_at)::date
  where work_date is null
    and occurred_at is not null;

  update public.horodateur_events
  set week_start_date = date_trunc('week', timezone('America/Montreal', occurred_at))::date
  where week_start_date is null
    and occurred_at is not null;
end $$;

alter table if exists public.horodateur_events
  alter column occurred_at set default timezone('utc', now());

create index if not exists idx_horodateur_events_employee_occurred_at
  on public.horodateur_events (employee_id, occurred_at desc);

create index if not exists idx_horodateur_events_employee_work_date
  on public.horodateur_events (employee_id, work_date desc);

create index if not exists idx_horodateur_events_status_occurred_at
  on public.horodateur_events (status, occurred_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'horodateur_events'
      and column_name = 'user_id'
  ) then
    execute 'create index if not exists idx_horodateur_events_user_occurred_at_legacy on public.horodateur_events (user_id, occurred_at desc)';
  end if;
end $$;
