-- Congés prolongés / absences longue durée (distinct du statut portail actif/inactif).

create table if not exists public.employee_leave_periods (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.chauffeurs (id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date null,
  expected_return_date date null,
  is_indefinite boolean not null default false,
  status text not null default 'active',
  reason_public text null,
  private_note text null,
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz null,
  ended_by uuid null references auth.users (id) on delete set null,
  constraint employee_leave_periods_leave_type_chk check (
    leave_type in (
      'sick_leave',
      'injury',
      'personal_leave',
      'vacation_extended',
      'administrative_leave',
      'other'
    )
  ),
  constraint employee_leave_periods_status_chk check (status in ('active', 'ended', 'cancelled'))
);

create unique index if not exists idx_employee_leave_periods_one_active
  on public.employee_leave_periods (employee_id)
  where status = 'active';

create index if not exists idx_employee_leave_periods_employee
  on public.employee_leave_periods (employee_id);

create index if not exists idx_employee_leave_periods_status_dates
  on public.employee_leave_periods (status, start_date, end_date);

create or replace function public.set_employee_leave_periods_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_employee_leave_periods_updated_at on public.employee_leave_periods;
create trigger trg_employee_leave_periods_updated_at
  before update on public.employee_leave_periods
  for each row execute function public.set_employee_leave_periods_updated_at();

alter table public.employee_leave_periods enable row level security;

comment on table public.employee_leave_periods is
  'Absence longue durée : employé peut rester actif portail ; exclu de la disponibilité effectifs.';

-- Modèle optionnel : notification statut travail sans détail médical.
INSERT INTO public.app_communication_templates (
  template_key, category, channel, audience, name, description, subject, body,
  default_subject, default_body, active, variables, implementation_status, is_system
) VALUES (
  'employee_work_status_updated_employee_email',
  'Employés',
  'email',
  'employee',
  'Mise à jour du statut de travail',
  E'Notification générique sans détail médical.',
  E'TAGORA Time — Statut de travail',
  E'Bonjour {{employee_name}},\n\nVotre statut de travail a été mis à jour. Consultez votre espace employé.\n\n{{dashboard_url}}',
  E'TAGORA Time — Statut de travail',
  E'Bonjour {{employee_name}},\n\nVotre statut de travail a été mis à jour. Consultez votre espace employé.\n\n{{dashboard_url}}',
  true,
  '[]'::jsonb,
  'planned',
  true
) ON CONFLICT (template_key, channel, audience) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  default_subject = EXCLUDED.default_subject,
  default_body = EXCLUDED.default_body,
  updated_at = timezone('utc', now());

INSERT INTO public.app_communication_templates (
  template_key, category, channel, audience, name, description, subject, body,
  default_subject, default_body, active, variables, implementation_status, is_system
) VALUES (
  'employee_work_status_updated_employee_sms',
  'Employés',
  'sms',
  'employee',
  'Mise à jour du statut — SMS',
  null,
  null,
  E'TAGORA Time : votre statut de travail a été mis à jour. Consultez l''application.',
  null,
  E'TAGORA Time : votre statut de travail a été mis à jour. Consultez l''application.',
  true,
  '[]'::jsonb,
  'planned',
  true
) ON CONFLICT (template_key, channel, audience) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  default_subject = EXCLUDED.default_subject,
  default_body = EXCLUDED.default_body,
  updated_at = timezone('utc', now());
