-- Extend regular closed days with company separation and align effectifs coverage windows.

-- Canonical company keys already used in project:
-- all, oliem_solutions, titan_produits_industriels

create table if not exists public.effectifs_regular_closed_days (
  id uuid primary key default gen_random_uuid(),
  company_key text not null default 'all',
  day_of_week integer not null,
  scope text not null default 'company',
  department_key text null,
  location_key text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.effectifs_regular_closed_days
  add column if not exists company_key text not null default 'all';

alter table public.effectifs_regular_closed_days
  add column if not exists location_key text null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'effectifs_regular_closed_days'
      and column_name = 'location'
  ) then
    update public.effectifs_regular_closed_days
    set location_key = coalesce(location_key, nullif(trim(location::text), ''))
    where location_key is null;
  end if;
end $$;

update public.effectifs_regular_closed_days
set company_key = 'all'
where company_key is null or trim(company_key) = '';

alter table public.effectifs_regular_closed_days
  drop constraint if exists effectifs_regular_closed_days_dow_check;
alter table public.effectifs_regular_closed_days
  add constraint effectifs_regular_closed_days_dow_check
  check (day_of_week >= 0 and day_of_week <= 6);

alter table public.effectifs_regular_closed_days
  drop constraint if exists effectifs_regular_closed_days_scope_check;
alter table public.effectifs_regular_closed_days
  add constraint effectifs_regular_closed_days_scope_check
  check (scope in ('company', 'department', 'location'));

alter table public.effectifs_regular_closed_days
  drop constraint if exists effectifs_regular_closed_days_company_key_check;
alter table public.effectifs_regular_closed_days
  add constraint effectifs_regular_closed_days_company_key_check
  check (company_key in ('all', 'oliem_solutions', 'titan_produits_industriels'));

drop index if exists public.idx_effectifs_regular_closed_days_unique;
drop index if exists public.idx_effectifs_regular_closed_days_unique_company;
create unique index if not exists idx_effectifs_regular_closed_days_unique_company
  on public.effectifs_regular_closed_days (
    company_key,
    day_of_week,
    scope,
    coalesce(department_key, ''),
    coalesce(location_key, '')
  );

-- company_key on coverage windows (global by default).
alter table public.department_coverage_windows
  add column if not exists company_key text not null default 'all';

update public.department_coverage_windows
set company_key = 'all'
where company_key is null or trim(company_key) = '';

alter table public.department_coverage_windows
  drop constraint if exists department_coverage_windows_company_key_check;
alter table public.department_coverage_windows
  add constraint department_coverage_windows_company_key_check
  check (company_key in ('all', 'oliem_solutions', 'titan_produits_industriels'));

create index if not exists idx_department_coverage_windows_company_dow
  on public.department_coverage_windows (company_key, day_of_week, department_key);

-- Default weekends closed globally (all companies), idempotent.
insert into public.effectifs_regular_closed_days (
  company_key, day_of_week, scope, department_key, location_key, active
)
select 'all', 5, 'company', null, null, true
where not exists (
  select 1 from public.effectifs_regular_closed_days
  where company_key = 'all'
    and day_of_week = 5
    and scope = 'company'
    and department_key is null
    and location_key is null
);

insert into public.effectifs_regular_closed_days (
  company_key, day_of_week, scope, department_key, location_key, active
)
select 'all', 6, 'company', null, null, true
where not exists (
  select 1 from public.effectifs_regular_closed_days
  where company_key = 'all'
    and day_of_week = 6
    and scope = 'company'
    and department_key is null
    and location_key is null
);
