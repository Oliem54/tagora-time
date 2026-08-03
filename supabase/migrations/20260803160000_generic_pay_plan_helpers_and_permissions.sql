-- ============================================================
-- 6E.2A — Generic pay plan foundation: helpers + permissions
-- Local draft only. Do not apply without Martin GO.
-- Greenfield. No 6D/events/accruals changes. No backfill. No seeds.
-- ============================================================

begin;

-- ---------------------------------------------------------------------------
-- Catalog: 12 frozen pay-plan permissions (no global accounting role)
-- ---------------------------------------------------------------------------
insert into public.app_permissions (slug, label, module_key, description, sort_order)
values
  (
    'commission_plan_template_manage',
    'Gestion des modèles de pay plans',
    'commissions',
    'Créer, versionner et archiver les templates génériques de compensation.',
    610
  ),
  (
    'commission_plan_assign',
    'Affectation des pay plans',
    'commissions',
    'Affecter, suspendre et terminer des versions de plans aux employés.',
    620
  ),
  (
    'commission_sale_create',
    'Création de ventes commissionnables',
    'commissions',
    'Créer des ventes et lignes destinées au moteur générique.',
    630
  ),
  (
    'commission_sale_assign',
    'Attribution de ventes',
    'commissions',
    'Attribuer une vente ou une ligne à un ou plusieurs employés.',
    640
  ),
  (
    'commission_sale_reassign',
    'Réattribution de ventes',
    'commissions',
    'Réattribuer une vente ou une ligne avec audit.',
    650
  ),
  (
    'commission_calculation_review',
    'Revue des calculs de commissions',
    'commissions',
    'Consulter et revoir les calculs générés par le moteur.',
    660
  ),
  (
    'commission_approve',
    'Approbation métier des commissions',
    'commissions',
    'Approuver les calculs selon les portes métier.',
    670
  ),
  (
    'commission_accounting',
    'Comptabilité des commissions',
    'commissions',
    'Permission organisationnelle de comptabilité (profit, marge, confirmation, paie). Pas un app_role global.',
    680
  ),
  (
    'commission_payment_confirm',
    'Confirmation de paiement des commissions',
    'commissions',
    'Confirmer le versement payé d’une commission.',
    690
  ),
  (
    'commission_adjustment_create',
    'Ajustements et reprises',
    'commissions',
    'Créer des ajustements et reprises liés aux calculs d’origine.',
    700
  ),
  (
    'commission_export',
    'Export officiel des commissions',
    'commissions',
    'Exporter les données officielles de rémunération.',
    710
  ),
  (
    'commission_audit_read',
    'Lecture du journal d’audit commissions',
    'commissions',
    'Lire le journal d’audit des pay plans génériques.',
    720
  )
on conflict (slug) do update
set
  label = excluded.label,
  module_key = excluded.module_key,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- updated_at helper (hardened; do not reuse unhardened legacy trigger helpers)
-- ---------------------------------------------------------------------------
create or replace function public.set_pay_plan_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at := pg_catalog.timezone('utc', pg_catalog.now());
  return new;
end;
$$;

comment on function public.set_pay_plan_updated_at() is
  '6E.2A: BEFORE UPDATE updated_at for generic pay plan tables. SECURITY INVOKER. search_path=pg_catalog.';

revoke all on function public.set_pay_plan_updated_at() from public;
revoke all on function public.set_pay_plan_updated_at() from anon;
revoke all on function public.set_pay_plan_updated_at() from authenticated;
grant execute on function public.set_pay_plan_updated_at() to service_role;

-- ---------------------------------------------------------------------------
-- Organization-scoped permission gate (UUID membership authority)
-- Reuses: current_user_can_access_organization, is_admin_user, current_app_permissions
-- ---------------------------------------------------------------------------
create or replace function public.user_has_pay_plan_permission(
  p_organization_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    p_organization_id is not null
    and p_permission is not null
    and public.current_user_can_access_organization(p_organization_id)
    and (
      public.is_admin_user()
      or p_permission = any (public.current_app_permissions())
    );
$$;

comment on function public.user_has_pay_plan_permission(uuid, text) is
  '6E.2A: True when caller has active UUID membership on organization AND (admin role OR JWT permission slug). No text slug authority. No global accounting role.';

revoke all on function public.user_has_pay_plan_permission(uuid, text) from public;
revoke all on function public.user_has_pay_plan_permission(uuid, text) from anon;
grant execute on function public.user_has_pay_plan_permission(uuid, text) to authenticated;
grant execute on function public.user_has_pay_plan_permission(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- organization_id immutability after insert
-- ---------------------------------------------------------------------------
create or replace function public.prevent_pay_plan_organization_id_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable after insert'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.prevent_pay_plan_organization_id_change() is
  '6E.2A: Blocks organization_id reassignment on generic pay plan rows.';

revoke all on function public.prevent_pay_plan_organization_id_change() from public;
revoke all on function public.prevent_pay_plan_organization_id_change() from anon;
revoke all on function public.prevent_pay_plan_organization_id_change() from authenticated;
grant execute on function public.prevent_pay_plan_organization_id_change() to service_role;

-- ---------------------------------------------------------------------------
-- Content-lock helper stub (replaced when compensation_plan_versions exists)
-- ---------------------------------------------------------------------------
create or replace function public.pay_plan_version_is_content_locked(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select false;
$$;

comment on function public.pay_plan_version_is_content_locked(uuid) is
  '6E.2A: Stub until compensation_plan_versions exists; replaced in versions migration.';

revoke all on function public.pay_plan_version_is_content_locked(uuid) from public;
revoke all on function public.pay_plan_version_is_content_locked(uuid) from anon;
grant execute on function public.pay_plan_version_is_content_locked(uuid) to authenticated;
grant execute on function public.pay_plan_version_is_content_locked(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Code normalization for configurable codes (account class / template)
-- ---------------------------------------------------------------------------
create or replace function public.normalize_pay_plan_code(p_value text)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select case
    when p_value is null then null
    when pg_catalog.btrim(p_value) = '' then null
    when pg_catalog.lower(pg_catalog.btrim(p_value)) ~ '^[a-z0-9_]{1,64}$'
      then pg_catalog.lower(pg_catalog.btrim(p_value))
    else null
  end;
$$;

comment on function public.normalize_pay_plan_code(text) is
  '6E.2A: Normalizes configurable codes to lower a-z0-9_ (1..64). Returns null if invalid.';

revoke all on function public.normalize_pay_plan_code(text) from public;
revoke all on function public.normalize_pay_plan_code(text) from anon;
grant execute on function public.normalize_pay_plan_code(text) to authenticated;
grant execute on function public.normalize_pay_plan_code(text) to service_role;

notify pgrst, 'reload schema';

commit;
