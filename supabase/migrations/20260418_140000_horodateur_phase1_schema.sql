create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'horodateur_actor_role') then
    create type public.horodateur_actor_role as enum (
      'employe',
      'direction',
      'systeme'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'horodateur_source_kind') then
    create type public.horodateur_source_kind as enum (
      'employe',
      'direction',
      'automatique'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'horodateur_event_status') then
    create type public.horodateur_event_status as enum (
      'normal',
      'en_attente',
      'approuve',
      'refuse'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'horodateur_state_kind') then
    create type public.horodateur_state_kind as enum (
      'hors_quart',
      'en_quart',
      'en_pause',
      'en_diner',
      'termine'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'horodateur_shift_status') then
    create type public.horodateur_shift_status as enum (
      'ouvert',
      'ferme',
      'en_attente',
      'valide'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'horodateur_exception_type') then
    create type public.horodateur_exception_type as enum (
      'outside_schedule',
      'direction_manual_correction',
      'shift_too_long',
      'incoherent_pause',
      'incoherent_dinner',
      'invalid_sequence',
      'missing_punch_adjustment'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'horodateur_exception_status') then
    create type public.horodateur_exception_status as enum (
      'en_attente',
      'approuve',
      'refuse',
      'modifie'
    );
  end if;
end $$;

alter table if exists public.chauffeurs
  add column if not exists horodateur_tolerance_before_start_minutes integer not null default 0,
  add column if not exists horodateur_tolerance_after_end_minutes integer not null default 0,
  add column if not exists horodateur_max_shift_minutes integer not null default 720;

alter table if exists public.chauffeurs
  drop constraint if exists chauffeurs_horodateur_tolerance_before_start_minutes_check;

alter table if exists public.chauffeurs
  add constraint chauffeurs_horodateur_tolerance_before_start_minutes_check
  check (horodateur_tolerance_before_start_minutes >= 0);

alter table if exists public.chauffeurs
  drop constraint if exists chauffeurs_horodateur_tolerance_after_end_minutes_check;

alter table if exists public.chauffeurs
  add constraint chauffeurs_horodateur_tolerance_after_end_minutes_check
  check (horodateur_tolerance_after_end_minutes >= 0);

alter table if exists public.chauffeurs
  drop constraint if exists chauffeurs_horodateur_max_shift_minutes_check;

alter table if exists public.chauffeurs
  add constraint chauffeurs_horodateur_max_shift_minutes_check
  check (horodateur_max_shift_minutes > 0);

drop policy if exists "horodateur_events_select_policy" on public.horodateur_events;
drop policy if exists "horodateur_events_insert_policy" on public.horodateur_events;
drop policy if exists "horodateur_events_update_policy" on public.horodateur_events;
drop policy if exists "horodateur_events_delete_policy" on public.horodateur_events;

drop index if exists public.idx_horodateur_events_user_date;

alter table if exists public.horodateur_events
  add column if not exists employee_id bigint,
  add column if not exists actor_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists actor_role public.horodateur_actor_role not null default 'employe',
  add column if not exists source_kind public.horodateur_source_kind not null default 'employe',
  add column if not exists status public.horodateur_event_status not null default 'normal',
  add column if not exists requires_approval boolean not null default false,
  add column if not exists exception_code public.horodateur_exception_type null,
  add column if not exists approved_by uuid null references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz null,
  add column if not exists rejected_by uuid null references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists approval_note text null,
  add column if not exists related_event_id uuid null references public.horodateur_events (id) on delete set null,
  add column if not exists work_date date null,
  add column if not exists week_start_date date null,
  add column if not exists is_manual_correction boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'horodateur_events'
      and column_name = 'user_id'
  ) then
    update public.horodateur_events he
    set actor_user_id = he.user_id
    where he.actor_user_id is null
      and he.user_id is not null
      and exists (
        select 1
        from auth.users au
        where au.id = he.user_id
      );
  end if;
end $$;

update public.horodateur_events he
set employee_id = c.id
from public.chauffeurs c
where he.employee_id is null
  and he.actor_user_id is not null
  and c.auth_user_id = he.actor_user_id;

update public.horodateur_events
set work_date = timezone('America/Toronto', occurred_at)::date
where work_date is null;

update public.horodateur_events
set week_start_date = date_trunc('week', timezone('America/Toronto', occurred_at))::date
where week_start_date is null;

do $$
declare
  unresolved_count integer;
begin
  select count(*)
  into unresolved_count
  from public.horodateur_events
  where employee_id is null;

  if unresolved_count > 0 then
    raise exception
      'Migration bloquee: % ligne(s) dans horodateur_events n ont pas de employee_id resolu. Liez d abord ces donnees a chauffeurs.id.',
      unresolved_count;
  end if;
end $$;

alter table if exists public.horodateur_events
  drop constraint if exists horodateur_events_event_type_check;

alter table if exists public.horodateur_events
  drop constraint if exists horodateur_events_employee_id_fkey;

alter table if exists public.horodateur_events
  add constraint horodateur_events_employee_id_fkey
  foreign key (employee_id) references public.chauffeurs (id) on delete restrict;

alter table if exists public.horodateur_events
  alter column employee_id set not null;

alter table if exists public.horodateur_events
  drop constraint if exists horodateur_events_requires_approval_check;

alter table if exists public.horodateur_events
  add constraint horodateur_events_requires_approval_check
  check (
    (requires_approval = false)
    or (exception_code is not null)
  );

alter table if exists public.horodateur_events
  drop constraint if exists horodateur_events_manual_note_check;

alter table if exists public.horodateur_events
  add constraint horodateur_events_manual_note_check
  check (
    (is_manual_correction = false)
    or (coalesce(nullif(btrim(notes), ''), '') <> '')
  );

alter table if exists public.horodateur_events
  drop constraint if exists horodateur_events_work_date_check;

alter table if exists public.horodateur_events
  add constraint horodateur_events_work_date_check
  check (work_date is not null and week_start_date is not null);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'horodateur_events'
      and column_name = 'user_id'
  ) then
    alter table public.horodateur_events
      drop column user_id;
  end if;
end $$;

create index if not exists idx_horodateur_events_employee_occurred_at
  on public.horodateur_events (employee_id, occurred_at desc);

create index if not exists idx_horodateur_events_work_date
  on public.horodateur_events (employee_id, work_date desc);

create index if not exists idx_horodateur_events_week_start
  on public.horodateur_events (employee_id, week_start_date desc);

create index if not exists idx_horodateur_events_status
  on public.horodateur_events (status, occurred_at desc);

create index if not exists idx_horodateur_events_pending
  on public.horodateur_events (employee_id, occurred_at desc)
  where status = 'en_attente';

create index if not exists idx_horodateur_events_related_event
  on public.horodateur_events (related_event_id);

create table if not exists public.horodateur_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.chauffeurs (id) on delete cascade,
  shift_start_event_id uuid null references public.horodateur_events (id) on delete set null,
  shift_end_event_id uuid null references public.horodateur_events (id) on delete set null,
  work_date date not null,
  week_start_date date not null,
  company_context text not null check (
    company_context in ('oliem_solutions', 'titan_produits_industriels')
  ),
  shift_start_at timestamptz null,
  shift_end_at timestamptz null,
  gross_minutes integer not null default 0,
  paid_break_minutes integer not null default 0,
  unpaid_break_minutes integer not null default 0,
  unpaid_lunch_minutes integer not null default 0,
  worked_minutes integer not null default 0,
  payable_minutes integer not null default 0,
  approved_exception_minutes integer not null default 0,
  pending_exception_minutes integer not null default 0,
  anomalies jsonb not null default '[]'::jsonb,
  anomalies_count integer not null default 0,
  status public.horodateur_shift_status not null default 'ouvert',
  last_recomputed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint horodateur_shifts_employee_work_date_key unique (employee_id, work_date),
  constraint horodateur_shifts_gross_minutes_check check (gross_minutes >= 0),
  constraint horodateur_shifts_paid_break_minutes_check check (paid_break_minutes >= 0),
  constraint horodateur_shifts_unpaid_break_minutes_check check (unpaid_break_minutes >= 0),
  constraint horodateur_shifts_unpaid_lunch_minutes_check check (unpaid_lunch_minutes >= 0),
  constraint horodateur_shifts_worked_minutes_check check (worked_minutes >= 0),
  constraint horodateur_shifts_payable_minutes_check check (payable_minutes >= 0),
  constraint horodateur_shifts_anomalies_count_check check (anomalies_count >= 0)
);

create index if not exists idx_horodateur_shifts_employee_week
  on public.horodateur_shifts (employee_id, week_start_date desc);

create index if not exists idx_horodateur_shifts_status_work_date
  on public.horodateur_shifts (status, work_date desc);

create index if not exists idx_horodateur_shifts_company_week
  on public.horodateur_shifts (company_context, week_start_date desc);

create table if not exists public.horodateur_current_state (
  employee_id bigint primary key references public.chauffeurs (id) on delete cascade,
  current_state public.horodateur_state_kind not null default 'hors_quart',
  active_shift_id uuid null references public.horodateur_shifts (id) on delete set null,
  active_shift_start_event_id uuid null references public.horodateur_events (id) on delete set null,
  active_pause_start_event_id uuid null references public.horodateur_events (id) on delete set null,
  active_dinner_start_event_id uuid null references public.horodateur_events (id) on delete set null,
  last_event_id uuid null references public.horodateur_events (id) on delete set null,
  last_event_type text null,
  last_event_at timestamptz null,
  company_context text null check (
    company_context is null
    or company_context in ('oliem_solutions', 'titan_produits_industriels')
  ),
  has_open_exception boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_horodateur_current_state_kind
  on public.horodateur_current_state (current_state, updated_at desc);

create index if not exists idx_horodateur_current_state_exception
  on public.horodateur_current_state (has_open_exception, updated_at desc);

create table if not exists public.horodateur_exceptions (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.chauffeurs (id) on delete cascade,
  shift_id uuid null references public.horodateur_shifts (id) on delete set null,
  source_event_id uuid not null references public.horodateur_events (id) on delete cascade,
  exception_type public.horodateur_exception_type not null,
  reason_label text not null,
  details text null,
  impact_minutes integer not null default 0,
  status public.horodateur_exception_status not null default 'en_attente',
  requested_at timestamptz not null default timezone('utc', now()),
  requested_by_user_id uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  review_note text null,
  approved_minutes integer null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint horodateur_exceptions_source_event_key unique (source_event_id),
  constraint horodateur_exceptions_review_check check (
    (status = 'en_attente')
    or (reviewed_at is not null and reviewed_by_user_id is not null)
  )
);

create index if not exists idx_horodateur_exceptions_status_requested
  on public.horodateur_exceptions (status, requested_at asc);

create index if not exists idx_horodateur_exceptions_employee_status
  on public.horodateur_exceptions (employee_id, status, requested_at asc);

create index if not exists idx_horodateur_exceptions_shift
  on public.horodateur_exceptions (shift_id);

create index if not exists idx_horodateur_exceptions_type_status
  on public.horodateur_exceptions (exception_type, status, requested_at asc);
