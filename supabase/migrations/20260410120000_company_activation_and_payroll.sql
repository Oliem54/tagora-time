create extension if not exists pgcrypto;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_requests'
      and column_name = 'company'
  ) then
    update public.account_requests
    set company = case
      when lower(trim(company)) in ('oliem_solutions', 'oliem solutions') then 'oliem_solutions'
      when lower(trim(company)) in ('titan_produits_industriels', 'titan produits industriels') then 'titan_produits_industriels'
      else 'oliem_solutions'
    end
    where company is null
      or lower(trim(company)) not in (
        'oliem_solutions',
        'oliem solutions',
        'titan_produits_industriels',
        'titan produits industriels'
      );
  end if;
end $$;

alter table if exists public.account_requests
  alter column company set not null;

alter table if exists public.account_requests
  drop constraint if exists account_requests_company_check;

alter table if exists public.account_requests
  add constraint account_requests_company_check
  check (company in ('oliem_solutions', 'titan_produits_industriels'));

alter table if exists public.chauffeurs
  add column if not exists primary_company text,
  add column if not exists can_work_for_oliem_solutions boolean not null default true,
  add column if not exists can_work_for_titan_produits_industriels boolean not null default false;

update public.chauffeurs
set primary_company = coalesce(primary_company, 'oliem_solutions');

alter table if exists public.chauffeurs
  drop constraint if exists chauffeurs_primary_company_check;

alter table if exists public.chauffeurs
  add constraint chauffeurs_primary_company_check
  check (
    primary_company in ('oliem_solutions', 'titan_produits_industriels')
  );

create index if not exists idx_chauffeurs_primary_company
  on public.chauffeurs (primary_company);

alter table if exists public.horodateur_events
  add column if not exists company_context text;

update public.horodateur_events he
set company_context = c.primary_company
from public.chauffeurs c
where he.company_context is null
  and c.id::text = he.metadata ->> 'chauffeur_id';

alter table if exists public.horodateur_events
  drop constraint if exists horodateur_events_company_context_check;

alter table if exists public.horodateur_events
  add constraint horodateur_events_company_context_check
  check (
    company_context is null
    or company_context in ('oliem_solutions', 'titan_produits_industriels')
  );

create index if not exists idx_horodateur_events_company_context
  on public.horodateur_events (company_context, occurred_at desc);

alter table if exists public.sorties_terrain
  add column if not exists company_context text;

update public.sorties_terrain st
set company_context = c.primary_company
from public.chauffeurs c
where st.company_context is null
  and st.chauffeur_id = c.id;

alter table if exists public.sorties_terrain
  drop constraint if exists sorties_terrain_company_context_check;

alter table if exists public.sorties_terrain
  add constraint sorties_terrain_company_context_check
  check (
    company_context is null
    or company_context in ('oliem_solutions', 'titan_produits_industriels')
  );

create index if not exists idx_sorties_terrain_company_context
  on public.sorties_terrain (company_context, date_sortie desc);

alter table if exists public.livraisons_planifiees
  add column if not exists company_context text;

update public.livraisons_planifiees lp
set company_context = c.primary_company
from public.chauffeurs c
where lp.company_context is null
  and lp.chauffeur_id = c.id;

update public.livraisons_planifiees
set company_context = 'oliem_solutions'
where company_context is null;

alter table if exists public.livraisons_planifiees
  alter column company_context set not null;

alter table if exists public.livraisons_planifiees
  drop constraint if exists livraisons_planifiees_company_context_check;

alter table if exists public.livraisons_planifiees
  add constraint livraisons_planifiees_company_context_check
  check (company_context in ('oliem_solutions', 'titan_produits_industriels'));

create index if not exists idx_livraisons_planifiees_company_context
  on public.livraisons_planifiees (company_context, date_livraison desc);

alter table if exists public.temps_titan
  add column if not exists company_context text;

update public.temps_titan tt
set company_context = c.primary_company
from public.chauffeurs c
where tt.company_context is null
  and tt.employe_id = c.id;

alter table if exists public.temps_titan
  drop constraint if exists temps_titan_company_context_check;

alter table if exists public.temps_titan
  add constraint temps_titan_company_context_check
  check (
    company_context is null
    or company_context in ('oliem_solutions', 'titan_produits_industriels')
  );

create index if not exists idx_temps_titan_company_context
  on public.temps_titan (company_context, date_travail desc);

create or replace view public.payroll_company_summary as
select
  coalesce(tt.company_context, 'oliem_solutions') as company_context,
  tt.employe_id,
  tt.employe_nom,
  min(tt.date_travail) as first_work_date,
  max(tt.date_travail) as last_work_date,
  sum(coalesce(tt.duree_heures, 0)) as total_hours,
  sum(coalesce(tt.total_salaire, 0)) as total_salary,
  sum(coalesce(tt.total_benefice, 0)) as total_margin,
  sum(coalesce(tt.total_titan, 0)) as total_billable
from public.temps_titan tt
group by coalesce(tt.company_context, 'oliem_solutions'), tt.employe_id, tt.employe_nom;
