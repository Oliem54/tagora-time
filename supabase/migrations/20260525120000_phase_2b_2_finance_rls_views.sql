-- Phase 2B-2: durcissement finance via vues operationnelles Direction.
-- Objectif: Direction sans montants financiers sensibles, Admin complet.
-- IMPORTANT: migration locale uniquement (aucune execution prod automatique).
--
-- Perimetre (separation explicite):
--   Finance interne confidentielle (admin seulement, tables brutes):
--     temps_titan, sales_objectives, commission_rules, commission_entries
--     + colonnes sensibles exclues des vues direction_* (taux, montants paie, commissions)
--   Finance operationnelle client / livraison / ramassage (hors migration):
--     livraisons_planifiees (payment_*, montants client), clients, operations, dossiers
--     — RLS existant (permissions livraisons) inchange par ce fichier
--   Chauffeurs: table partagee; lecture Direction restauree pour modules operationnels
--     (livraisons, ramassages, terrain, ressources) sans reouvrir commissions/paie.

begin;

-- ---------------------------------------------------------------------------
-- Helpers role/permission (idempotents)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'admin'
$$;

create or replace function public.is_direction_user()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'direction'
$$;

create or replace function public.is_direction_or_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('direction', 'admin')
$$;

-- ---------------------------------------------------------------------------
-- Vues operationnelles Direction (sans montants/taux/marges/couts)
-- Acces: Direction/Admin uniquement via barriere de role dans la vue.
-- Les vues direction_* n'utilisent pas security_invoker: les tables brutes
-- restent admin-only au niveau RLS; la vue filtre le role avant exposition.
-- ---------------------------------------------------------------------------

drop view if exists public.direction_temps_titan_operational;
create view public.direction_temps_titan_operational as
select
  tt.id,
  tt.employe_id,
  tt.employe_nom,
  tt.date_travail,
  tt.heure_debut,
  tt.heure_fin,
  tt.duree_totale,
  tt.duree_heures,
  tt.presence_minutes,
  tt.paid_break_minutes,
  tt.unpaid_break_minutes,
  tt.payable_minutes,
  tt.facturable_minutes,
  tt.temps_presence,
  tt.temps_payable,
  tt.temps_non_payable,
  tt.temps_facturable,
  tt.type_travail,
  tt.livraison,
  tt.notes,
  tt.refacturee_a_titan,
  tt.statut_paiement_titan,
  tt.source_type,
  tt.source_id
from public.temps_titan tt
where public.is_direction_or_admin();

comment on view public.direction_temps_titan_operational is
  'Vue Direction operationnelle de temps_titan, sans colonnes financieres sensibles.';

drop view if exists public.direction_payroll_operational_summary;
create view public.direction_payroll_operational_summary as
select
  p.company_context,
  p.employe_id,
  p.employe_nom,
  p.first_work_date,
  p.last_work_date,
  p.total_hours
from public.payroll_company_summary p
where public.is_direction_or_admin();

comment on view public.direction_payroll_operational_summary is
  'Synthese operationnelle Direction sans montants (payroll_company_summary).';

drop view if exists public.direction_intercompany_operational;
create view public.direction_intercompany_operational as
select
  tt.id,
  tt.employe_id,
  tt.employe_nom,
  tt.date_travail,
  tt.duree_heures,
  tt.type_travail,
  tt.statut_paiement_titan,
  tt.refacturee_a_titan
from public.temps_titan tt
where public.is_direction_or_admin()
  and (
    tt.refacturee_a_titan is true
    or tt.statut_paiement_titan is not null
  );

comment on view public.direction_intercompany_operational is
  'Vue Direction facturation operationnelle sans ventilation et sans montants.';

drop view if exists public.direction_employee_operational_profile;
create view public.direction_employee_operational_profile as
select
  c.id,
  c.auth_user_id,
  c.nom,
  c.telephone,
  c.courriel,
  c.numero_permis,
  c.classe_permis,
  c.expiration_permis,
  c.restrictions_permis,
  c.actif,
  c.notes,
  c.photo_permis_recto_url,
  c.photo_permis_verso_url,
  c.primary_company,
  c.can_work_for_oliem_solutions,
  c.can_work_for_titan_produits_industriels,
  c.schedule_start,
  c.schedule_end,
  c.scheduled_work_days,
  c.planned_daily_hours,
  c.planned_weekly_hours,
  c.pause_minutes,
  c.expected_breaks_count,
  c.break_1_label,
  c.break_1_minutes,
  c.break_1_paid,
  c.break_2_label,
  c.break_2_minutes,
  c.break_2_paid,
  c.break_3_label,
  c.break_3_minutes,
  c.break_3_paid,
  c.break_am_enabled,
  c.break_am_time,
  c.break_am_minutes,
  c.break_am_paid,
  c.lunch_enabled,
  c.lunch_time,
  c.lunch_minutes,
  c.lunch_paid,
  c.break_pm_enabled,
  c.break_pm_time,
  c.break_pm_minutes,
  c.break_pm_paid,
  c.sms_alert_depart_terrain,
  c.sms_alert_arrivee_terrain,
  c.sms_alert_sortie,
  c.sms_alert_retour,
  c.sms_alert_pause_debut,
  c.sms_alert_pause_fin,
  c.sms_alert_dinner_debut,
  c.sms_alert_dinner_fin,
  c.sms_alert_quart_debut,
  c.sms_alert_quart_fin,
  c.alert_email_enabled,
  c.alert_sms_enabled,
  c.is_direction_alert_recipient,
  c.effectifs_department_key,
  c.effectifs_secondary_department_keys,
  c.effectifs_primary_location,
  c.effectifs_secondary_locations,
  c.can_deliver,
  c.default_weekly_hours,
  c.schedule_active,
  c.weekly_schedule_config,
  c.fonctions,
  c.fonction_autre,
  c.account_invited_at,
  c.account_invited_by_user_id,
  c.account_invited_by_name,
  c.account_invitation_status,
  c.account_invitation_error
from public.chauffeurs c
where public.is_direction_or_admin();

comment on view public.direction_employee_operational_profile is
  'Profil employe Direction sans taux/couts/avantages financiers.';

drop view if exists public.direction_objectives_operational_view;
create view public.direction_objectives_operational_view as
select
  so.id,
  so.title,
  so.description,
  so.chauffeur_id,
  so.team_name,
  so.period_start,
  so.period_end,
  so.target_type,
  case when so.target_type = 'sales_count' then so.target_sales_count else null end as target_sales_count,
  so.achieved_sales_count,
  so.status,
  so.created_at,
  so.updated_at,
  count(ce.id) as entries_count,
  count(ce.id) filter (where ce.status = 'pending_validation') as entries_pending_validation,
  count(ce.id) filter (where ce.status = 'paid') as entries_paid
from public.sales_objectives so
left join public.commission_entries ce on ce.objective_id = so.id
where public.is_direction_or_admin()
group by
  so.id,
  so.title,
  so.description,
  so.chauffeur_id,
  so.team_name,
  so.period_start,
  so.period_end,
  so.target_type,
  so.target_sales_count,
  so.achieved_sales_count,
  so.status,
  so.created_at,
  so.updated_at;

comment on view public.direction_objectives_operational_view is
  'Objectifs Direction sans montants de commission ni bonus monetaire.';

-- ---------------------------------------------------------------------------
-- Grants PostgREST + barriere de role (employe = 0 ligne)
-- GRANT SELECT sur authenticated est requis par PostgREST; l'acces reel est
-- limite par is_direction_or_admin() dans chaque vue direction_*.
-- ---------------------------------------------------------------------------
revoke all on table public.direction_temps_titan_operational from public, anon;
revoke all on table public.direction_payroll_operational_summary from public, anon;
revoke all on table public.direction_intercompany_operational from public, anon;
revoke all on table public.direction_employee_operational_profile from public, anon;
revoke all on table public.direction_objectives_operational_view from public, anon;

grant select on table public.direction_temps_titan_operational to authenticated;
grant select on table public.direction_payroll_operational_summary to authenticated;
grant select on table public.direction_intercompany_operational to authenticated;
grant select on table public.direction_employee_operational_profile to authenticated;
grant select on table public.direction_objectives_operational_view to authenticated;

-- ---------------------------------------------------------------------------
-- Vues financieres existantes (Admin via RLS): security_invoker
-- ---------------------------------------------------------------------------
alter view if exists public.payroll_company_summary set (security_invoker = true);
alter view if exists public.intercompany_billing_summary set (security_invoker = true);

-- Vues direction_*: security_invoker desactive pour ne pas contourner la
-- barriere de role ni exposer les tables brutes (admin-only) aux employes.
alter view if exists public.direction_temps_titan_operational set (security_invoker = false);
alter view if exists public.direction_payroll_operational_summary set (security_invoker = false);
alter view if exists public.direction_intercompany_operational set (security_invoker = false);
alter view if exists public.direction_employee_operational_profile set (security_invoker = false);
alter view if exists public.direction_objectives_operational_view set (security_invoker = false);

-- ---------------------------------------------------------------------------
-- RLS strict sur tables brutes sensibles (finance interne): Admin seulement
-- Hors perimetre: livraisons_planifiees, clients, operations (finance client intacte)
-- ---------------------------------------------------------------------------
alter table if exists public.temps_titan enable row level security;
alter table if exists public.chauffeurs enable row level security;
alter table if exists public.sales_objectives enable row level security;
alter table if exists public.commission_rules enable row level security;
alter table if exists public.commission_entries enable row level security;

drop policy if exists temps_titan_select_direction_admin on public.temps_titan;
drop policy if exists temps_titan_insert_direction_admin on public.temps_titan;
drop policy if exists temps_titan_update_direction_admin on public.temps_titan;
drop policy if exists "temps_titan_select_policy" on public.temps_titan;
drop policy if exists "temps_titan_insert_policy" on public.temps_titan;
drop policy if exists "temps_titan_delete_policy" on public.temps_titan;
drop policy if exists "temps_titan_admin_select" on public.temps_titan;
drop policy if exists "temps_titan_admin_insert" on public.temps_titan;
drop policy if exists "temps_titan_admin_update" on public.temps_titan;
drop policy if exists "temps_titan_admin_delete" on public.temps_titan;

create policy "temps_titan_admin_select"
  on public.temps_titan
  for select
  to authenticated
  using (public.is_admin_user());

create policy "temps_titan_admin_insert"
  on public.temps_titan
  for insert
  to authenticated
  with check (public.is_admin_user());

create policy "temps_titan_admin_update"
  on public.temps_titan
  for update
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

create policy "temps_titan_admin_delete"
  on public.temps_titan
  for delete
  to authenticated
  using (public.is_admin_user());

drop policy if exists "chauffeurs_select_policy" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_select" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_insert" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_update" on public.chauffeurs;
drop policy if exists "chauffeurs_admin_delete" on public.chauffeurs;

create policy "chauffeurs_admin_select"
  on public.chauffeurs
  for select
  to authenticated
  using (public.is_admin_user());

create policy "chauffeurs_admin_insert"
  on public.chauffeurs
  for insert
  to authenticated
  with check (public.is_admin_user());

create policy "chauffeurs_admin_update"
  on public.chauffeurs
  for update
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

create policy "chauffeurs_admin_delete"
  on public.chauffeurs
  for delete
  to authenticated
  using (public.is_admin_user());

-- Direction: lecture chauffeurs pour livraisons / ramassages / terrain / effectifs UI.
-- Remplace chauffeurs_select_policy (supprime ci-dessus). Ecriture reste admin-only.
-- Finance confidentielle (taux, commissions): tables commission_* admin-only;
-- profil sans taux via direction_employee_operational_profile.
drop policy if exists "chauffeurs_direction_operational_select" on public.chauffeurs;

create policy "chauffeurs_direction_operational_select"
  on public.chauffeurs
  for select
  to authenticated
  using (
    public.is_direction_user()
    and (
      public.has_app_permission('ressources')
      or public.has_app_permission('livraisons')
      or public.has_app_permission('terrain')
    )
  );

drop policy if exists "sales_objectives_commissions_policy" on public.sales_objectives;
drop policy if exists "commission_rules_commissions_policy" on public.commission_rules;
drop policy if exists "commission_entries_commissions_policy" on public.commission_entries;
drop policy if exists "sales_objectives_admin_all" on public.sales_objectives;
drop policy if exists "commission_rules_admin_all" on public.commission_rules;
drop policy if exists "commission_entries_admin_all" on public.commission_entries;

create policy "sales_objectives_admin_all"
  on public.sales_objectives
  for all
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

create policy "commission_rules_admin_all"
  on public.commission_rules
  for all
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

create policy "commission_entries_admin_all"
  on public.commission_entries
  for all
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

notify pgrst, 'reload schema';

commit;
