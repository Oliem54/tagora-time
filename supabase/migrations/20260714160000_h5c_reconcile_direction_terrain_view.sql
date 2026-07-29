-- ============================================================
-- H5-C forward-only reconciliation (Direction terrain view)
-- Canonical historical source (DO NOT re-run / DO NOT mark applied):
--   20260410140000_direction_terrain_compatibility.sql           (R2)
-- Partial dependency retained from 20260429130000 (view mode only):
--   security_invoker = true
-- Explicitly OUT of scope from 20260429130000:
--   RBAC helpers, policies, metadata migrations (those belong to later security lot)
--
-- Scope: CREATE OR REPLACE VIEW public.direction_terrain_positions only.
-- Compatible before Horodateur transition: keep horodateur_events.user_id (no employee_id join).
-- Forbidden: table/column changes, policies, functions, seeds, destructive drops.
-- Out of scope: subsequent H5 lots after C, H4 SaaS.
-- Rollback: migration repair --status reverted; restore view DDL from snapshot.
--
-- Local note: historical Horodateur migrations may already drop user_id.
-- In that case this file skips the view replace (does not re-add user_id).
-- Staging (user_id present) always applies the canonical definition.
-- ============================================================

do $$
declare
  missing text;
  has_user_id boolean;
begin
  if to_regclass('public.gps_positions') is null then
    raise exception 'H5-C STOP: missing table public.gps_positions';
  end if;
  if to_regclass('public.sorties_terrain') is null then
    raise exception 'H5-C STOP: missing table public.sorties_terrain';
  end if;
  if to_regclass('public.horodateur_events') is null then
    raise exception 'H5-C STOP: missing table public.horodateur_events';
  end if;

  select string_agg(req.col, ', ' order by req.col) into missing
  from (
    values
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
      ('sorties_terrain','temps_total'),
      ('horodateur_events','id'),
      ('horodateur_events','company_context'),
      ('horodateur_events','event_type'),
      ('horodateur_events','sortie_id'),
      ('horodateur_events','livraison_id'),
      ('horodateur_events','notes'),
      ('horodateur_events','metadata'),
      ('horodateur_events','occurred_at')
  ) as req(tbl, col)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = req.tbl
      and c.column_name = req.col
  );

  if missing is not null then
    raise exception 'H5-C STOP: missing required columns: %', missing;
  end if;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'horodateur_events'
      and c.column_name = 'user_id'
  ) into has_user_id;

  if not has_user_id then
    raise notice
      'H5-C: horodateur_events.user_id absent — skip CREATE OR REPLACE VIEW on this database (post Horodateur transition). Staging target still requires user_id.';
    return;
  end if;

  -- Staging current view exposes id as uuid (gps passthrough). Canonical contract uses text ids
  -- across mixed sources. PostgreSQL forbids CREATE OR REPLACE when column types change,
  -- so DROP VIEW without cascading then CREATE is required (no table changes).
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
  he.user_id,
  null::bigint as chauffeur_id,
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
where he.occurred_at is not null
  and he.user_id is not null
$view$;
end $$;
