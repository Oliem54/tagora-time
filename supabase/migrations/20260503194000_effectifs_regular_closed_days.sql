-- Jours fermes reguliers (prioritaires sur les plages hours-to-cover).

create table if not exists public.effectifs_regular_closed_days (
  id uuid primary key default gen_random_uuid(),
  day_of_week integer not null,
  scope text not null default 'company',
  department_key text null,
  location text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint effectifs_regular_closed_days_dow_check
    check (day_of_week >= 0 and day_of_week <= 6),
  constraint effectifs_regular_closed_days_scope_check
    check (scope in ('company', 'department', 'location')),
  constraint effectifs_regular_closed_days_department_check
    check (
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
    )
);

create unique index if not exists idx_effectifs_regular_closed_days_unique
  on public.effectifs_regular_closed_days (
    day_of_week,
    scope,
    coalesce(department_key, ''),
    coalesce(location, '')
  );

create index if not exists idx_effectifs_regular_closed_days_active
  on public.effectifs_regular_closed_days (active, day_of_week);

create or replace function public.set_effectifs_regular_closed_days_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_effectifs_regular_closed_days_updated_at
  on public.effectifs_regular_closed_days;

create trigger trg_effectifs_regular_closed_days_updated_at
before update on public.effectifs_regular_closed_days
for each row execute function public.set_effectifs_regular_closed_days_updated_at();

do $$
begin
  if exists (
    select 1
    from public.effectifs_regular_closed_days
    where day_of_week = 5 and scope = 'company' and department_key is null and location is null
  ) then
    update public.effectifs_regular_closed_days
    set active = true
    where day_of_week = 5 and scope = 'company' and department_key is null and location is null;
  else
    insert into public.effectifs_regular_closed_days (day_of_week, scope, department_key, location, active)
    values (5, 'company', null, null, true);
  end if;

  if exists (
    select 1
    from public.effectifs_regular_closed_days
    where day_of_week = 6 and scope = 'company' and department_key is null and location is null
  ) then
    update public.effectifs_regular_closed_days
    set active = true
    where day_of_week = 6 and scope = 'company' and department_key is null and location is null;
  else
    insert into public.effectifs_regular_closed_days (day_of_week, scope, department_key, location, active)
    values (6, 'company', null, null, true);
  end if;
end $$;
