alter table if exists public.chauffeurs
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists social_benefits_percent numeric(5, 2) not null default 15,
  add column if not exists titan_billable boolean not null default false,
  add column if not exists planned_daily_hours numeric(5, 2),
  add column if not exists planned_weekly_hours numeric(5, 2),
  add column if not exists scheduled_work_days text[] not null default '{}';

create unique index if not exists idx_chauffeurs_auth_user_id
  on public.chauffeurs (auth_user_id)
  where auth_user_id is not null;

update public.chauffeurs
set
  social_benefits_percent = coalesce(social_benefits_percent, 15),
  titan_billable = coalesce(titan_billable, can_work_for_titan_produits_industriels, false)
where social_benefits_percent is distinct from coalesce(social_benefits_percent, 15)
   or titan_billable is distinct from coalesce(titan_billable, can_work_for_titan_produits_industriels, false);
