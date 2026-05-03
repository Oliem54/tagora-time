alter table public.chauffeurs
  add column if not exists weekly_schedule_config jsonb null;

comment on column public.chauffeurs.weekly_schedule_config is
  'Configuration horaire hebdomadaire detaillee par jour pour TAGORA Time.';
