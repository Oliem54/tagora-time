alter table if exists public.sorties_terrain
  add column if not exists morning_break_minutes integer not null default 0,
  add column if not exists morning_break_paid boolean not null default true,
  add column if not exists lunch_minutes integer not null default 0,
  add column if not exists lunch_paid boolean not null default false,
  add column if not exists afternoon_break_minutes integer not null default 0,
  add column if not exists afternoon_break_paid boolean not null default true,
  add column if not exists presence_minutes integer not null default 0,
  add column if not exists paid_break_minutes integer not null default 0,
  add column if not exists unpaid_break_minutes integer not null default 0,
  add column if not exists payable_minutes integer not null default 0,
  add column if not exists facturable_minutes integer not null default 0,
  add column if not exists temps_payable text,
  add column if not exists temps_non_payable text,
  add column if not exists temps_facturable text;

alter table if exists public.temps_titan
  add column if not exists morning_break_minutes integer not null default 0,
  add column if not exists morning_break_paid boolean not null default true,
  add column if not exists lunch_minutes integer not null default 0,
  add column if not exists lunch_paid boolean not null default false,
  add column if not exists afternoon_break_minutes integer not null default 0,
  add column if not exists afternoon_break_paid boolean not null default true,
  add column if not exists presence_minutes integer not null default 0,
  add column if not exists paid_break_minutes integer not null default 0,
  add column if not exists unpaid_break_minutes integer not null default 0,
  add column if not exists payable_minutes integer not null default 0,
  add column if not exists facturable_minutes integer not null default 0,
  add column if not exists temps_presence text,
  add column if not exists temps_payable text,
  add column if not exists temps_non_payable text,
  add column if not exists temps_facturable text;

update public.temps_titan
set
  presence_minutes = case
    when coalesce(presence_minutes, 0) > 0 then presence_minutes
    else round(coalesce(duree_heures, 0) * 60)::integer
  end,
  payable_minutes = case
    when coalesce(payable_minutes, 0) > 0 then payable_minutes
    else round(coalesce(duree_heures, 0) * 60)::integer
  end,
  facturable_minutes = case
    when coalesce(facturable_minutes, 0) > 0 then facturable_minutes
    else round(coalesce(duree_heures, 0) * 60)::integer
  end,
  temps_presence = coalesce(temps_presence, duree_totale),
  temps_payable = coalesce(temps_payable, duree_totale),
  temps_non_payable = coalesce(temps_non_payable, '0 min'),
  temps_facturable = coalesce(temps_facturable, duree_totale)
where true;

create or replace view public.intercompany_billing_summary as
select
  tt.company_context,
  tt.billing_company_context,
  tt.employe_id,
  tt.employe_nom,
  sum(
    case
      when coalesce(tt.facturable_minutes, 0) > 0 then tt.facturable_minutes::numeric / 60.0
      else coalesce(tt.duree_heures, 0)
    end
  ) as total_hours,
  sum(coalesce(tt.distance_km, 0)) as total_km,
  sum(coalesce(tt.total_facturable, 0)) as total_billable
from public.temps_titan tt
where tt.billing_company_context is not null
  and tt.billing_company_context <> tt.company_context
group by
  tt.company_context,
  tt.billing_company_context,
  tt.employe_id,
  tt.employe_nom;

create or replace view public.payroll_company_summary as
select
  coalesce(tt.company_context, 'oliem_solutions') as company_context,
  tt.employe_id,
  tt.employe_nom,
  min(tt.date_travail) as first_work_date,
  max(tt.date_travail) as last_work_date,
  sum(
    case
      when coalesce(tt.payable_minutes, 0) > 0 then tt.payable_minutes::numeric / 60.0
      else coalesce(tt.duree_heures, 0)
    end
  ) as total_hours,
  sum(coalesce(tt.total_salaire, 0)) as total_salary,
  sum(coalesce(tt.total_benefice, 0)) as total_margin,
  sum(coalesce(tt.total_titan, 0)) as total_billable
from public.temps_titan tt
group by coalesce(tt.company_context, 'oliem_solutions'), tt.employe_id, tt.employe_nom;
