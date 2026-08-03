-- ============================================================
-- 6E.2A — compensation_account_classes
-- Configurable account-class codes per organization (UUID tenant).
-- No seed. No golf hardcode. No legacy table changes.
-- ============================================================

begin;

create table if not exists public.compensation_account_classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  code text not null,
  display_name text not null,
  description text null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  created_by uuid null references auth.users (id) on delete set null,
  archived_at timestamptz null,
  constraint compensation_account_classes_code_format_check
    check (code = public.normalize_pay_plan_code(code)),
  constraint compensation_account_classes_display_name_check
    check (pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 120),
  constraint compensation_account_classes_sort_order_check
    check (sort_order >= 0),
  constraint compensation_account_classes_org_code_unique
    unique (organization_id, code)
);

comment on table public.compensation_account_classes is
  '6E.2A: Organization-configurable account class codes for generic pay plans. No employee/brand/company hardcode. No seeded business values.';

comment on column public.compensation_account_classes.organization_id is
  'Canonical tenant UUID (organizations.id). Text slug is never RLS authority.';

comment on column public.compensation_account_classes.code is
  'Configurable code (a-z0-9_). Example values may include golf later as data, never as engine logic.';

create index if not exists compensation_account_classes_org_idx
  on public.compensation_account_classes (organization_id);

create index if not exists compensation_account_classes_org_active_idx
  on public.compensation_account_classes (organization_id, is_active);

create index if not exists compensation_account_classes_org_code_idx
  on public.compensation_account_classes (organization_id, code);

drop trigger if exists trg_compensation_account_classes_updated_at
  on public.compensation_account_classes;
create trigger trg_compensation_account_classes_updated_at
  before update on public.compensation_account_classes
  for each row execute function public.set_pay_plan_updated_at();

drop trigger if exists trg_compensation_account_classes_org_immutable
  on public.compensation_account_classes;
create trigger trg_compensation_account_classes_org_immutable
  before update on public.compensation_account_classes
  for each row execute function public.prevent_pay_plan_organization_id_change();

alter table public.compensation_account_classes enable row level security;
alter table public.compensation_account_classes force row level security;

revoke all on table public.compensation_account_classes from public;
revoke all on table public.compensation_account_classes from anon;
grant select, insert, update on table public.compensation_account_classes to authenticated;
grant select, insert, update, delete on table public.compensation_account_classes to service_role;

drop policy if exists compensation_account_classes_select
  on public.compensation_account_classes;
create policy compensation_account_classes_select
  on public.compensation_account_classes
  for select
  to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_calculation_review')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
  );

drop policy if exists compensation_account_classes_insert
  on public.compensation_account_classes;
create policy compensation_account_classes_insert
  on public.compensation_account_classes
  for insert
  to authenticated
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  );

drop policy if exists compensation_account_classes_update
  on public.compensation_account_classes;
create policy compensation_account_classes_update
  on public.compensation_account_classes
  for update
  to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  )
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  );

-- No DELETE policy for authenticated: soft-archive via archived_at / is_active only.

notify pgrst, 'reload schema';

commit;
