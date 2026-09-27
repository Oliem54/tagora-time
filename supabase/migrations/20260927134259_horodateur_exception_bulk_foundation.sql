-- Premium 2027: additive exception archive, logical delete, and bulk audit.
-- No hard delete. No definer function. No punch, shift, or hour changes.

alter table public.horodateur_exceptions
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users (id) on delete set null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users (id) on delete set null,
  add column if not exists bulk_action_id uuid null,
  add column if not exists motif text null;

comment on column public.horodateur_exceptions.deleted_at is
  'Suppression logique. La suppression definitive n est pas autorisee par cette migration.';

create index if not exists idx_horodateur_exceptions_org_company_status
  on public.horodateur_exceptions (organization_id, organization_company_id, status, requested_at desc);

create index if not exists idx_horodateur_exceptions_active
  on public.horodateur_exceptions (organization_id, organization_company_id, requested_at desc)
  where deleted_at is null;

create table if not exists public.horodateur_exception_bulk_audit (
  id uuid primary key default gen_random_uuid(),
  bulk_action_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  organization_company_id uuid not null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  action text not null,
  filters jsonb not null default '{}'::jsonb,
  requested_count integer not null,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  result text not null,
  idempotency_key text not null,
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint horodateur_exception_bulk_audit_action_check check (
    action in (
      'preview',
      'approve',
      'refuse',
      'resolve',
      'archive',
      'restore',
      'soft_delete',
      'export'
    )
  ),
  constraint horodateur_exception_bulk_audit_result_check check (
    result in ('success', 'partial', 'failed')
  ),
  constraint horodateur_exception_bulk_audit_counts_check check (
    requested_count >= 0
    and success_count >= 0
    and failure_count >= 0
  ),
  constraint horodateur_exception_bulk_audit_company_fk
    foreign key (organization_company_id, organization_id)
    references public.organization_companies (id, organization_id)
);

create unique index if not exists horodateur_exception_bulk_audit_idempotency_uidx
  on public.horodateur_exception_bulk_audit (organization_id, idempotency_key);

create index if not exists horodateur_exception_bulk_audit_company_created_idx
  on public.horodateur_exception_bulk_audit (organization_id, organization_company_id, created_at desc);

comment on table public.horodateur_exception_bulk_audit is
  'Journal des actions en lot sur les exceptions. N expose aucune suppression definitive.';

alter table public.horodateur_exception_bulk_audit enable row level security;
alter table public.horodateur_exception_bulk_audit force row level security;

revoke all on table public.horodateur_exception_bulk_audit from public;
revoke all on table public.horodateur_exception_bulk_audit from anon;

drop policy if exists "horodateur_exception_bulk_audit_select_tenant_company"
  on public.horodateur_exception_bulk_audit;

create policy "horodateur_exception_bulk_audit_select_tenant_company"
  on public.horodateur_exception_bulk_audit
  for select
  to authenticated
  using (
    public.current_user_can_access_organization(organization_id)
    and exists (
      select 1
      from public.organization_companies oc
      where oc.id = horodateur_exception_bulk_audit.organization_company_id
        and oc.organization_id = horodateur_exception_bulk_audit.organization_id
    )
    and (
      exists (
        select 1
        from public.organization_memberships m
        where m.user_id = (select auth.uid())
          and m.organization_id = horodateur_exception_bulk_audit.organization_id
          and m.status = 'active'
          and m.role in ('organization_owner', 'organization_admin', 'direction')
      )
      or exists (
        select 1
        from public.chauffeurs c
        where c.auth_user_id = (select auth.uid())
          and c.organization_id = horodateur_exception_bulk_audit.organization_id
          and c.organization_company_id = horodateur_exception_bulk_audit.organization_company_id
      )
    )
  );

grant select on table public.horodateur_exception_bulk_audit to authenticated;
grant select, insert on table public.horodateur_exception_bulk_audit to service_role;

drop policy if exists "horodateur_exceptions_select_phase1" on public.horodateur_exceptions;
create policy "horodateur_exceptions_select_phase1" on public.horodateur_exceptions
  for select to authenticated
  using (
    deleted_at is null
    and (
      (
        exists (
          select 1 from public.chauffeurs c
          where c.id = horodateur_exceptions.employee_id
            and c.auth_user_id = (select auth.uid())
            and c.organization_id = horodateur_exceptions.organization_id
            and c.organization_company_id = horodateur_exceptions.organization_company_id
        )
        and public.current_user_can_access_organization(organization_id)
      )
      or (
        public.is_direction_user()
        and public.has_app_permission('terrain')
        and public.current_user_can_access_organization(organization_id)
        and exists (
          select 1
          from public.organization_companies oc
          where oc.id = horodateur_exceptions.organization_company_id
            and oc.organization_id = horodateur_exceptions.organization_id
        )
      )
    )
  );

notify pgrst, 'reload schema';
