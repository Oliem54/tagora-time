-- Journées spéciales (fermetures, fériés, horaires exceptionnels) et demandes d’horaire employés.
-- Référence planifiée module /direction/effectifs (prévu ≠ horodateur réel).

-- ---------------------------------------------------------------------------
-- effectifs_calendar_exceptions
-- ---------------------------------------------------------------------------
create table if not exists public.effectifs_calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  type text not null,
  is_closed boolean not null default false,
  department_key text null,
  location text null,
  start_time time null,
  end_time time null,
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint effectifs_calendar_exceptions_type_check check (
    type in (
      'open',
      'closed',
      'holiday',
      'exceptional_closure',
      'reduced_hours',
      'special_hours',
      'inventory',
      'internal_event',
      'other'
    )
  ),
  constraint effectifs_calendar_exceptions_department_key_check check (
    department_key is null
    or department_key in (
      'showroom_oliem',
      'showroom_titan',
      'montage_voiturette',
      'service_apres_vente',
      'design_numerique',
      'operations',
      'livreur',
      'administration',
      'autre'
    )
  ),
  constraint effectifs_calendar_exceptions_times_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index if not exists idx_effectifs_calendar_exceptions_date
  on public.effectifs_calendar_exceptions (date);

create index if not exists idx_effectifs_calendar_exceptions_date_dept
  on public.effectifs_calendar_exceptions (date, department_key);

comment on table public.effectifs_calendar_exceptions is
  'Jours spéciaux planchers (fermé, férié, horaire réduit, etc.). department_key null = toute l’entreprise.';

-- ---------------------------------------------------------------------------
-- effectifs_employee_schedule_requests
-- ---------------------------------------------------------------------------
create table if not exists public.effectifs_employee_schedule_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.chauffeurs (id) on delete cascade,
  request_type text not null,
  requested_date date not null,
  start_time time null,
  end_time time null,
  target_department_key text null,
  target_location text null,
  reason text null,
  status text not null default 'pending',
  reviewed_by uuid null,
  reviewed_at timestamptz null,
  review_note text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint effectifs_schedule_requests_type_check check (
    request_type in (
      'day_off',
      'start_later',
      'leave_early',
      'change_shift',
      'swap_shift',
      'unavailable',
      'available_extra',
      'remote_work',
      'other'
    )
  ),
  constraint effectifs_schedule_requests_status_check check (
    status in ('pending', 'approved', 'rejected', 'cancelled')
  ),
  constraint effectifs_schedule_requests_dept_check check (
    target_department_key is null
    or target_department_key in (
      'showroom_oliem',
      'showroom_titan',
      'montage_voiturette',
      'service_apres_vente',
      'design_numerique',
      'operations',
      'livreur',
      'administration',
      'autre'
    )
  ),
  constraint effectifs_schedule_requests_times_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index if not exists idx_effectifs_schedule_requests_employee
  on public.effectifs_employee_schedule_requests (employee_id);

create index if not exists idx_effectifs_schedule_requests_date
  on public.effectifs_employee_schedule_requests (requested_date);

create index if not exists idx_effectifs_schedule_requests_status
  on public.effectifs_employee_schedule_requests (status);

comment on table public.effectifs_employee_schedule_requests is
  'Demandes d’ajustement d’horaire (ponctuelles par défaut après approbation).';

create or replace function public.set_effectifs_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_effectifs_calendar_exceptions_updated_at
  on public.effectifs_calendar_exceptions;
create trigger trg_effectifs_calendar_exceptions_updated_at
  before update on public.effectifs_calendar_exceptions
  for each row execute function public.set_effectifs_row_updated_at();

drop trigger if exists trg_effectifs_schedule_requests_updated_at
  on public.effectifs_employee_schedule_requests;
create trigger trg_effectifs_schedule_requests_updated_at
  before update on public.effectifs_employee_schedule_requests
  for each row execute function public.set_effectifs_row_updated_at();
