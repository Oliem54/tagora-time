alter table if exists public.chauffeurs
  add column if not exists titan_enabled boolean not null default false,
  add column if not exists titan_mode_timeclock boolean not null default true,
  add column if not exists titan_mode_sorties boolean not null default true,
  add column if not exists titan_hourly_rate numeric(10, 2);

update public.chauffeurs
set
  titan_enabled = case
    when titan_billable = true then true
    when can_work_for_titan_produits_industriels = true then true
    else titan_enabled
  end,
  titan_hourly_rate = coalesce(titan_hourly_rate, taux_base_titan),
  social_benefits_percent = coalesce(social_benefits_percent, 15),
  titan_mode_timeclock = case
    when titan_billable = true then true
    else titan_mode_timeclock
  end,
  titan_mode_sorties = case
    when titan_billable = true then true
    else titan_mode_sorties
  end
where true;

create index if not exists idx_chauffeurs_titan_enabled
  on public.chauffeurs (titan_enabled);
