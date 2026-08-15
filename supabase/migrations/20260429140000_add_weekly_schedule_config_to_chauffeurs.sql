alter table public.chauffeurs
add column if not exists weekly_schedule_config jsonb null;

comment on column public.chauffeurs.weekly_schedule_config is
'Horaire hebdomadaire variable TAGORA Time. mode=fixed conserve les colonnes legacy; mode=variable utilise days[monday..sunday].';
