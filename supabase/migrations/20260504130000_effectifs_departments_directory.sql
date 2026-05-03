-- Introduce configurable effectifs departments directory (phase 1).
-- This table decorates the existing 9 canonical department keys with company
-- and location context. The SQL CHECK constraints on department_key across
-- other tables remain unchanged: phase 1 only seeds the canonical keys here.

create table if not exists public.effectifs_departments (
  id uuid primary key default gen_random_uuid(),
  department_key text not null unique,
  label text not null,
  company_key text not null default 'all',
  location_key text null,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.effectifs_departments
  drop constraint if exists effectifs_departments_company_key_check;
alter table public.effectifs_departments
  add constraint effectifs_departments_company_key_check
  check (company_key in ('all', 'oliem_solutions', 'titan_produits_industriels'));

create index if not exists idx_effectifs_departments_company_sort
  on public.effectifs_departments (company_key, sort_order);

create index if not exists idx_effectifs_departments_active
  on public.effectifs_departments (active);

-- updated_at trigger (idempotent, aligned with other effectifs aux tables).
create or replace function public.effectifs_departments_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_effectifs_departments_touch_updated_at on public.effectifs_departments;
create trigger trg_effectifs_departments_touch_updated_at
before update on public.effectifs_departments
for each row execute function public.effectifs_departments_touch_updated_at();

-- Seed the 9 canonical department keys with company mapping (idempotent).
insert into public.effectifs_departments (department_key, label, company_key, location_key, sort_order, active)
select 'showroom_oliem', 'Showroom Oliem', 'oliem_solutions', 'oliem', 10, true
where not exists (select 1 from public.effectifs_departments where department_key = 'showroom_oliem');

insert into public.effectifs_departments (department_key, label, company_key, location_key, sort_order, active)
select 'showroom_titan', 'Showroom Titan', 'titan_produits_industriels', 'titan', 20, true
where not exists (select 1 from public.effectifs_departments where department_key = 'showroom_titan');

insert into public.effectifs_departments (department_key, label, company_key, location_key, sort_order, active)
select 'montage_voiturette', 'Montage voiturette', 'oliem_solutions', null, 30, true
where not exists (select 1 from public.effectifs_departments where department_key = 'montage_voiturette');

insert into public.effectifs_departments (department_key, label, company_key, location_key, sort_order, active)
select 'service_apres_vente', 'Service après vente', 'all', null, 40, true
where not exists (select 1 from public.effectifs_departments where department_key = 'service_apres_vente');

insert into public.effectifs_departments (department_key, label, company_key, location_key, sort_order, active)
select 'design_numerique', 'Design numérique', 'all', null, 50, true
where not exists (select 1 from public.effectifs_departments where department_key = 'design_numerique');

insert into public.effectifs_departments (department_key, label, company_key, location_key, sort_order, active)
select 'operations', 'Opérations', 'all', null, 60, true
where not exists (select 1 from public.effectifs_departments where department_key = 'operations');

insert into public.effectifs_departments (department_key, label, company_key, location_key, sort_order, active)
select 'livreur', 'Livreur', 'all', null, 70, true
where not exists (select 1 from public.effectifs_departments where department_key = 'livreur');

insert into public.effectifs_departments (department_key, label, company_key, location_key, sort_order, active)
select 'administration', 'Administration', 'all', null, 80, true
where not exists (select 1 from public.effectifs_departments where department_key = 'administration');

insert into public.effectifs_departments (department_key, label, company_key, location_key, sort_order, active)
select 'autre', 'Autre', 'all', null, 90, true
where not exists (select 1 from public.effectifs_departments where department_key = 'autre');
