-- Phase sales-book grants V1: livres de ventes / commissions confidentiels.
-- Perimetre: table grants Admin, vue employe self-only avec montants, vue Direction grant-only sans montants.
-- Hors scope V1: objectifs team_name-only, acces Direction global, can_edit Direction, seed grants.
-- IMPORTANT: migration locale uniquement (aucune execution prod automatique).
-- Ne touche pas: livraisons_planifiees, clients, operations, dossiers, horodateur, livraison/ramassage.

begin;

-- ---------------------------------------------------------------------------
-- Helpers (idempotents)
-- ---------------------------------------------------------------------------
create or replace function public.current_employee_chauffeur_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.chauffeurs c
  where c.auth_user_id = auth.uid()
  limit 1;
$$;

comment on function public.current_employee_chauffeur_id() is
  'Retourne la fiche chauffeur liee au compte Auth courant (employe).';

-- ---------------------------------------------------------------------------
-- commission_book_access_grants
-- ---------------------------------------------------------------------------
create table if not exists public.commission_book_access_grants (
  id uuid primary key default gen_random_uuid(),
  owner_chauffeur_id bigint not null references public.chauffeurs (id) on delete cascade,
  viewer_user_id uuid not null references auth.users (id) on delete cascade,
  viewer_role text not null default 'direction',
  granted_by_admin_id uuid not null references auth.users (id),
  can_view boolean not null default true,
  can_edit boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz null,
  expires_at timestamptz null,
  notes text null,
  constraint commission_book_access_grants_viewer_role_check check (viewer_role = 'direction'),
  constraint commission_book_access_grants_can_edit_v1_check check (can_edit = false),
  constraint commission_book_access_grants_can_view_active_check check (can_view = true)
);

create unique index if not exists idx_commission_book_access_grants_active_owner_viewer
  on public.commission_book_access_grants (owner_chauffeur_id, viewer_user_id)
  where revoked_at is null;

create index if not exists idx_commission_book_access_grants_viewer_active
  on public.commission_book_access_grants (viewer_user_id)
  where revoked_at is null;

create index if not exists idx_commission_book_access_grants_owner_active
  on public.commission_book_access_grants (owner_chauffeur_id)
  where revoked_at is null;

comment on table public.commission_book_access_grants is
  'Acces Direction explicite a un livre de ventes / commissions par chauffeur (Admin accorde/revoque).';

comment on column public.commission_book_access_grants.owner_chauffeur_id is
  'Employe/chauffeur proprietaire du livre de ventes.';

comment on column public.commission_book_access_grants.viewer_user_id is
  'Utilisateur Direction autorise a consulter le livre (vue operationnelle sans montants en V1).';

comment on column public.commission_book_access_grants.revoked_at is
  'Revoque l acces; preferer UPDATE a DELETE.';

create or replace function public.has_active_commission_book_grant(p_chauffeur_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_app_role() = 'direction'
    and public.has_app_permission('commissions')
    and p_chauffeur_id is not null
    and exists (
      select 1
      from public.commission_book_access_grants g
      where g.owner_chauffeur_id = p_chauffeur_id
        and g.viewer_user_id = auth.uid()
        and g.viewer_role = 'direction'
        and g.can_view is true
        and g.revoked_at is null
        and (
          g.expires_at is null
          or g.expires_at > timezone('utc', now())
        )
    );
$$;

comment on function public.has_active_commission_book_grant(bigint) is
  'Direction + permission commissions: grant actif pour consulter le livre d un chauffeur.';

-- ---------------------------------------------------------------------------
-- RLS commission_book_access_grants (Admin seulement; pas de policy Direction/Employe)
-- ---------------------------------------------------------------------------
alter table public.commission_book_access_grants enable row level security;

drop policy if exists "commission_book_access_grants_admin_select" on public.commission_book_access_grants;
create policy "commission_book_access_grants_admin_select"
  on public.commission_book_access_grants
  for select
  to authenticated
  using (public.is_admin_user());

drop policy if exists "commission_book_access_grants_admin_insert" on public.commission_book_access_grants;
create policy "commission_book_access_grants_admin_insert"
  on public.commission_book_access_grants
  for insert
  to authenticated
  with check (public.is_admin_user());

drop policy if exists "commission_book_access_grants_admin_update" on public.commission_book_access_grants;
create policy "commission_book_access_grants_admin_update"
  on public.commission_book_access_grants
  for update
  to authenticated
  using (public.is_admin_user())
  with check (
    public.is_admin_user()
    and can_edit = false
  );

-- Pas de policy DELETE: revocation via UPDATE revoked_at uniquement.

-- ---------------------------------------------------------------------------
-- Vue employe: livre personnel avec montants (lecture seule, self-only)
-- Exclut objectifs team_name-only (chauffeur_id null).
-- ---------------------------------------------------------------------------
drop view if exists public.employee_sales_book_view;
create view public.employee_sales_book_view as
select
  so.id,
  so.title,
  so.description,
  so.chauffeur_id,
  so.period_start,
  so.period_end,
  so.target_type,
  so.target_amount,
  so.target_sales_count,
  so.achieved_amount,
  so.achieved_sales_count,
  so.status,
  so.company_context,
  so.created_at,
  so.updated_at,
  count(ce.id) as entries_count,
  count(ce.id) filter (where ce.status = 'pending_validation') as entries_pending_validation,
  count(ce.id) filter (where ce.status = 'paid') as entries_paid,
  coalesce(sum(ce.sales_basis_amount) filter (where ce.status <> 'cancelled'), 0) as total_sales_basis_amount,
  coalesce(sum(ce.calculated_amount) filter (where ce.status <> 'cancelled'), 0) as total_calculated_amount
from public.sales_objectives so
left join public.commission_entries ce on ce.objective_id = so.id
where public.current_app_role() = 'employe'
  and so.chauffeur_id is not null
  and so.chauffeur_id = public.current_employee_chauffeur_id()
group by
  so.id,
  so.title,
  so.description,
  so.chauffeur_id,
  so.period_start,
  so.period_end,
  so.target_type,
  so.target_amount,
  so.target_sales_count,
  so.achieved_amount,
  so.achieved_sales_count,
  so.status,
  so.company_context,
  so.created_at,
  so.updated_at;

comment on view public.employee_sales_book_view is
  'Livre de ventes employe: montants du propre livre uniquement (lecture seule, V1).';

-- ---------------------------------------------------------------------------
-- Vue Direction: livres accordes uniquement, sans montants monetaires
-- Exclut objectifs team_name-only (chauffeur_id null).
-- Admin utilise les tables brutes; cette vue est reservee a Direction grantee.
-- ---------------------------------------------------------------------------
drop view if exists public.direction_granted_objectives_operational_view;
create view public.direction_granted_objectives_operational_view as
select
  so.id,
  so.title,
  so.description,
  so.chauffeur_id,
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
where so.chauffeur_id is not null
  and public.has_active_commission_book_grant(so.chauffeur_id)
group by
  so.id,
  so.title,
  so.description,
  so.chauffeur_id,
  so.period_start,
  so.period_end,
  so.target_type,
  so.target_sales_count,
  so.achieved_sales_count,
  so.status,
  so.created_at,
  so.updated_at;

comment on view public.direction_granted_objectives_operational_view is
  'Objectifs Direction grant-only sans montants (permission commissions + grant actif requis).';

-- ---------------------------------------------------------------------------
-- Durcissement direction_objectives_operational_view: Admin seulement
-- Direction doit utiliser direction_granted_objectives_operational_view.
-- ---------------------------------------------------------------------------
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
where public.is_admin_user()
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
  'Vue operationnelle Admin sans montants; Direction n y a plus acces (grants requis).';

-- ---------------------------------------------------------------------------
-- RLS employe lecture seule sur tables commissions (self-only, chauffeur_id requis)
-- Admin conserve sales_objectives_admin_all / commission_*_admin_all existants.
-- ---------------------------------------------------------------------------
drop policy if exists "sales_objectives_employee_select" on public.sales_objectives;
create policy "sales_objectives_employee_select"
  on public.sales_objectives
  for select
  to authenticated
  using (
    public.current_app_role() = 'employe'
    and chauffeur_id is not null
    and chauffeur_id = public.current_employee_chauffeur_id()
  );

drop policy if exists "commission_rules_employee_select" on public.commission_rules;
create policy "commission_rules_employee_select"
  on public.commission_rules
  for select
  to authenticated
  using (
    public.current_app_role() = 'employe'
    and exists (
      select 1
      from public.sales_objectives so
      where so.id = commission_rules.objective_id
        and so.chauffeur_id is not null
        and so.chauffeur_id = public.current_employee_chauffeur_id()
    )
  );

drop policy if exists "commission_entries_employee_select" on public.commission_entries;
create policy "commission_entries_employee_select"
  on public.commission_entries
  for select
  to authenticated
  using (
    public.current_app_role() = 'employe'
    and chauffeur_id is not null
    and chauffeur_id = public.current_employee_chauffeur_id()
  );

-- ---------------------------------------------------------------------------
-- PostgREST grants + security_invoker (meme pattern PR #44)
-- ---------------------------------------------------------------------------
revoke all on table public.employee_sales_book_view from public, anon;
revoke all on table public.direction_granted_objectives_operational_view from public, anon;

grant select on table public.employee_sales_book_view to authenticated;
grant select on table public.direction_granted_objectives_operational_view to authenticated;

alter view if exists public.employee_sales_book_view set (security_invoker = false);
alter view if exists public.direction_granted_objectives_operational_view set (security_invoker = false);
alter view if exists public.direction_objectives_operational_view set (security_invoker = false);

notify pgrst, 'reload schema';

commit;
