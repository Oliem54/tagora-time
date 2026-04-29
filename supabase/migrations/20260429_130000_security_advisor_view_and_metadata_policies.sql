-- ============================================================
-- TAGORA Time - Security Advisor fixes
-- 1) direction_terrain_positions with security_invoker=true
-- 2) RLS policies migrated from user_metadata to app_metadata helpers
-- ============================================================

begin;

-- ------------------------------------------------------------------
-- View hardening: run as invoker to respect underlying table RLS
-- ------------------------------------------------------------------
create or replace view public.direction_terrain_positions
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
  st.heure_depart as recorded_at
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
  st.heure_retour as recorded_at
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
  and he.user_id is not null;

-- ------------------------------------------------------------------
-- Helpers: app_metadata role only
-- ------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

create or replace function public.is_direction_or_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('direction', 'admin')
$$;

-- ------------------------------------------------------------------
-- account_requests / temps_titan RLS policy reset without user_metadata
-- ------------------------------------------------------------------
alter table public.account_requests enable row level security;
alter table public.temps_titan enable row level security;

drop policy if exists account_requests_insert_pending_public on public.account_requests;
drop policy if exists account_requests_select_direction_admin on public.account_requests;
drop policy if exists account_requests_update_direction_admin on public.account_requests;
drop policy if exists account_requests_delete_direction_admin on public.account_requests;

create policy account_requests_insert_pending_public
on public.account_requests
for insert
to public
with check (
  status = 'pending'
  and coalesce(assigned_role::text, '') = ''
  and (
    assigned_permissions is null
    or coalesce(array_length(assigned_permissions, 1), 0) = 0
  )
  and review_note is null
  and reviewed_by is null
  and reviewed_at is null
  and invited_user_id is null
  and review_lock_token is null
  and review_started_at is null
  and last_error is null
);

create policy account_requests_select_direction_admin
on public.account_requests
for select
to authenticated
using (public.is_direction_or_admin());

create policy account_requests_update_direction_admin
on public.account_requests
for update
to authenticated
using (public.is_direction_or_admin())
with check (public.is_direction_or_admin());

create policy account_requests_delete_direction_admin
on public.account_requests
for delete
to authenticated
using (public.is_direction_or_admin());

drop policy if exists temps_titan_select_direction_admin on public.temps_titan;
drop policy if exists temps_titan_insert_direction_admin on public.temps_titan;
drop policy if exists temps_titan_update_direction_admin on public.temps_titan;

create policy temps_titan_select_direction_admin
on public.temps_titan
for select
to authenticated
using (public.is_direction_or_admin());

create policy temps_titan_insert_direction_admin
on public.temps_titan
for insert
to authenticated
with check (public.is_direction_or_admin());

create policy temps_titan_update_direction_admin
on public.temps_titan
for update
to authenticated
using (public.is_direction_or_admin())
with check (public.is_direction_or_admin());

commit;
