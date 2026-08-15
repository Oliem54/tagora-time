-- ============================================================
-- 6E.2A — compensation_plan_templates
-- Reusable greenfield templates. No employee_id. No named seeds.
-- ============================================================

begin;

create table if not exists public.compensation_plan_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  template_code text not null,
  display_name text not null,
  description text null,
  status text not null default 'draft',
  simple_mode_compatible boolean not null default true,
  current_version_id uuid null,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  created_by uuid null references auth.users (id) on delete set null,
  archived_at timestamptz null,
  constraint compensation_plan_templates_code_format_check
    check (
      public.normalize_pay_plan_code(template_code) is not null
      and template_code = public.normalize_pay_plan_code(template_code)
    ),
  constraint compensation_plan_templates_display_name_check
    check (pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 120),
  constraint compensation_plan_templates_status_check
    check (status in ('draft', 'active', 'archived')),
  constraint compensation_plan_templates_archive_consistency_check
    check (
      (status = 'archived' and archived_at is not null)
      or (status <> 'archived' and archived_at is null)
    ),
  constraint compensation_plan_templates_org_code_unique
    unique (organization_id, template_code)
);

comment on table public.compensation_plan_templates is
  '6E.2A: Reusable generic compensation plan templates. No employee_id column. No employee-named seeds.';

comment on column public.compensation_plan_templates.organization_id is
  'Canonical tenant UUID (organizations.id).';

comment on column public.compensation_plan_templates.current_version_id is
  'Optional pointer to active/current version; FK added after versions table exists.';

create index if not exists compensation_plan_templates_org_idx
  on public.compensation_plan_templates (organization_id);

create index if not exists compensation_plan_templates_org_status_idx
  on public.compensation_plan_templates (organization_id, status);

create index if not exists compensation_plan_templates_org_code_idx
  on public.compensation_plan_templates (organization_id, template_code);

drop trigger if exists trg_compensation_plan_templates_updated_at
  on public.compensation_plan_templates;
create trigger trg_compensation_plan_templates_updated_at
  before update on public.compensation_plan_templates
  for each row execute function public.set_pay_plan_updated_at();

drop trigger if exists trg_compensation_plan_templates_org_immutable
  on public.compensation_plan_templates;
create trigger trg_compensation_plan_templates_org_immutable
  before update on public.compensation_plan_templates
  for each row execute function public.prevent_pay_plan_organization_id_change();

alter table public.compensation_plan_templates enable row level security;
alter table public.compensation_plan_templates force row level security;

revoke all on table public.compensation_plan_templates from public;
revoke all on table public.compensation_plan_templates from anon;
grant select, insert, update on table public.compensation_plan_templates to authenticated;
grant select, insert, update, delete on table public.compensation_plan_templates to service_role;

drop policy if exists compensation_plan_templates_select
  on public.compensation_plan_templates;
create policy compensation_plan_templates_select
  on public.compensation_plan_templates
  for select
  to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_calculation_review')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
  );

drop policy if exists compensation_plan_templates_insert
  on public.compensation_plan_templates;
create policy compensation_plan_templates_insert
  on public.compensation_plan_templates
  for insert
  to authenticated
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  );

drop policy if exists compensation_plan_templates_update
  on public.compensation_plan_templates;
create policy compensation_plan_templates_update
  on public.compensation_plan_templates
  for update
  to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  )
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  );

notify pgrst, 'reload schema';

commit;
