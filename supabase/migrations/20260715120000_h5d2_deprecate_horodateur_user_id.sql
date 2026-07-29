-- ============================================================
-- H5-D2 forward-only — deprecate horodateur_events.user_id
-- Option B (Martin approved): keep column, drop NOT NULL, comment,
-- recreate direction_terrain_positions on employee_id + chauffeurs.auth_user_id.
--
-- Forbidden: DROP COLUMN user_id, DROP TABLE, CASCADE, TRUNCATE, policies,
-- RBAC functions, seeds, H5-E/F, H4 SaaS, historical rewrite.
-- Out of scope: marking historical H5-D (18140000…) applied.
--
-- Compatible:
--   - staging: user_id present (was NOT NULL) → DROP NOT NULL + view replace
--   - local: user_id may already be absent (Phase1 DROP) → skip nullability;
--     still recreate view when prerequisites exist
-- Rollback: leave user_id nullable; restore view DDL from snapshot only under mandate.
-- ============================================================

do $$
declare
  missing text;
  has_user_id boolean;
  user_id_nullable text;
begin
  if to_regclass('public.horodateur_events') is null then
    raise exception 'H5-D2 STOP: missing table public.horodateur_events';
  end if;
  if to_regclass('public.chauffeurs') is null then
    raise exception 'H5-D2 STOP: missing table public.chauffeurs';
  end if;
  if to_regclass('public.gps_positions') is null then
    raise exception 'H5-D2 STOP: missing table public.gps_positions';
  end if;
  if to_regclass('public.sorties_terrain') is null then
    raise exception 'H5-D2 STOP: missing table public.sorties_terrain';
  end if;

  select string_agg(req.col, ', ' order by req.col) into missing
  from (
    values
      ('horodateur_events','employee_id'),
      ('horodateur_events','actor_user_id'),
      ('horodateur_events','id'),
      ('horodateur_events','company_context'),
      ('horodateur_events','event_type'),
      ('horodateur_events','sortie_id'),
      ('horodateur_events','livraison_id'),
      ('horodateur_events','notes'),
      ('horodateur_events','metadata'),
      ('horodateur_events','occurred_at'),
      ('chauffeurs','id'),
      ('chauffeurs','auth_user_id'),
      ('gps_positions','id'),
      ('gps_positions','user_id'),
      ('gps_positions','chauffeur_id'),
      ('gps_positions','company_context'),
      ('gps_positions','company_directory_context'),
      ('gps_positions','latitude'),
      ('gps_positions','longitude'),
      ('gps_positions','speed_kmh'),
      ('gps_positions','gps_status'),
      ('gps_positions','activity_label'),
      ('gps_positions','sortie_id'),
      ('gps_positions','livraison_id'),
      ('gps_positions','horodateur_event_id'),
      ('gps_positions','intervention_label'),
      ('gps_positions','metadata'),
      ('gps_positions','recorded_at'),
      ('sorties_terrain','id'),
      ('sorties_terrain','user_id'),
      ('sorties_terrain','chauffeur_id'),
      ('sorties_terrain','company_context'),
      ('sorties_terrain','client'),
      ('sorties_terrain','livraison_id'),
      ('sorties_terrain','notes'),
      ('sorties_terrain','date_sortie'),
      ('sorties_terrain','heure_depart'),
      ('sorties_terrain','heure_retour'),
      ('sorties_terrain','temps_total')
  ) as req(tbl, col)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = req.tbl
      and c.column_name = req.col
  );

  if missing is not null then
    raise exception 'H5-D2 STOP: missing required columns: %', missing;
  end if;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'horodateur_events'
      and c.column_name = 'user_id'
  ) into has_user_id;

  if has_user_id then
    select c.is_nullable
    into user_id_nullable
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'horodateur_events'
      and c.column_name = 'user_id';

    if user_id_nullable = 'NO' then
      alter table public.horodateur_events
        alter column user_id drop not null;
    end if;

    execute $cmt$
      comment on column public.horodateur_events.user_id is
        'LEGACY COMPATIBILITY ONLY. employee_id is the canonical employee identity (chauffeurs.id). actor_user_id identifies the actor who performed the action. Do not use user_id for new business logic. Column retained for old schemas/clients; H5-D2 does not DROP it.'
    $cmt$;
  else
    raise notice
      'H5-D2: horodateur_events.user_id absent — skip DROP NOT NULL / COMMENT (local post-Phase1). Proceeding with canonical employee_id view.';
  end if;

  -- DROP VIEW without CASCADE then CREATE (safe for type/shape refresh).
  execute 'drop view if exists public.direction_terrain_positions';

  execute $view$
create view public.direction_terrain_positions
with (security_invoker = true) as
select
  gp.id::text as id,
  'gps'::text as source_kind,
  'Flux GPS natif'::text as source_label,
  gp.user_id,
  gp.chauffeur_id,
  gp.company_context,
  gp.company_directory_context,
  gp.latitude,
  gp.longitude,
  gp.speed_kmh,
  gp.gps_status,
  gp.activity_label,
  gp.sortie_id,
  gp.livraison_id,
  gp.horodateur_event_id,
  gp.intervention_label,
  gp.metadata,
  gp.recorded_at
from public.gps_positions gp

union all

select
  ('sortie_depart-' || st.id::text) as id,
  'sortie_depart'::text as source_kind,
  'Sortie terrain depart'::text as source_label,
  st.user_id,
  st.chauffeur_id,
  st.company_context,
  case
    when st.company_context = 'titan_produits_industriels'
      then 'repertoire_titan_produits_industriels'
    else 'repertoire_oliem_solutions'
  end as company_directory_context,
  null::numeric(9, 6) as latitude,
  null::numeric(9, 6) as longitude,
  0::numeric(8, 2) as speed_kmh,
  'deplacement'::text as gps_status,
  coalesce(nullif(st.client, ''), 'Sortie terrain') as activity_label,
  st.id as sortie_id,
  st.livraison_id,
  null::uuid as horodateur_event_id,
  nullif(st.notes, '') as intervention_label,
  jsonb_build_object(
    'compatibility_source', 'sorties_terrain',
    'event', 'depart'
  ) as metadata,
  case
    when st.date_sortie is null then null::timestamptz
    else (st.date_sortie + st.heure_depart) at time zone 'America/Toronto'
  end as recorded_at
from public.sorties_terrain st
where st.heure_depart is not null
  and (st.user_id is not null or st.chauffeur_id is not null)

union all

select
  ('sortie_retour-' || st.id::text) as id,
  'sortie_retour'::text as source_kind,
  'Sortie terrain retour'::text as source_label,
  st.user_id,
  st.chauffeur_id,
  st.company_context,
  case
    when st.company_context = 'titan_produits_industriels'
      then 'repertoire_titan_produits_industriels'
    else 'repertoire_oliem_solutions'
  end as company_directory_context,
  null::numeric(9, 6) as latitude,
  null::numeric(9, 6) as longitude,
  0::numeric(8, 2) as speed_kmh,
  'arrive'::text as gps_status,
  coalesce(nullif(st.client, ''), 'Retour sortie terrain') as activity_label,
  st.id as sortie_id,
  st.livraison_id,
  null::uuid as horodateur_event_id,
  nullif(st.notes, '') as intervention_label,
  jsonb_build_object(
    'compatibility_source', 'sorties_terrain',
    'event', 'retour',
    'temps_total', st.temps_total
  ) as metadata,
  case
    when st.date_sortie is null then null::timestamptz
    else (st.date_sortie + st.heure_retour) at time zone 'America/Toronto'
  end as recorded_at
from public.sorties_terrain st
where st.heure_retour is not null
  and (st.user_id is not null or st.chauffeur_id is not null)

union all

select
  ('horodateur-' || he.id::text) as id,
  'horodateur'::text as source_kind,
  'Evenement horodateur'::text as source_label,
  c.auth_user_id as user_id,
  he.employee_id as chauffeur_id,
  he.company_context,
  case
    when he.company_context = 'titan_produits_industriels'
      then 'repertoire_titan_produits_industriels'
    else 'repertoire_oliem_solutions'
  end as company_directory_context,
  null::numeric(9, 6) as latitude,
  null::numeric(9, 6) as longitude,
  0::numeric(8, 2) as speed_kmh,
  case
    when he.event_type = 'sortie_depart' then 'deplacement'
    when he.event_type = 'sortie_retour' then 'arrive'
    when he.event_type = 'pause_debut' then 'arret'
    when he.event_type = 'quart_fin' then 'inactif'
    else 'actif'
  end as gps_status,
  replace(initcap(replace(he.event_type, '_', ' ')), 'Quart ', 'Quart ') as activity_label,
  he.sortie_id,
  he.livraison_id,
  he.id as horodateur_event_id,
  nullif(he.notes, '') as intervention_label,
  coalesce(he.metadata, '{}'::jsonb) || jsonb_build_object(
    'compatibility_source', 'horodateur_events'
  ) as metadata,
  he.occurred_at as recorded_at
from public.horodateur_events he
join public.chauffeurs c
  on c.id = he.employee_id
where he.occurred_at is not null
  and he.employee_id is not null
$view$;
end $$;
