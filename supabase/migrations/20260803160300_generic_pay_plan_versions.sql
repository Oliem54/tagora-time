-- ============================================================
-- 6E.2A — compensation_plan_versions
-- Immutable after leaving draft. Activation requires effective_from.
-- ============================================================

begin;

create table if not exists public.compensation_plan_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id)
    on delete restrict,
  template_id uuid not null
    references public.compensation_plan_templates (id)
    on delete restrict,
  version_number integer not null,
  status text not null default 'draft',
  effective_from date null,
  effective_to date null,
  change_reason text null,
  is_immutable boolean not null default false,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  created_by uuid null references auth.users (id) on delete set null,
  activated_at timestamptz null,
  activated_by uuid null references auth.users (id) on delete set null,
  constraint compensation_plan_versions_version_number_check
    check (version_number > 0),
  constraint compensation_plan_versions_status_check
    check (status in ('draft', 'scheduled', 'active', 'archived', 'cancelled')),
  constraint compensation_plan_versions_effective_range_check
    check (
      effective_to is null
      or effective_from is null
      or effective_to > effective_from
    ),
  constraint compensation_plan_versions_activation_effective_check
    check (
      status not in ('active', 'scheduled')
      or effective_from is not null
    ),
  constraint compensation_plan_versions_active_immutable_check
    check (
      status = 'draft'
      or is_immutable = true
    ),
  constraint compensation_plan_versions_template_version_unique
    unique (template_id, version_number)
);

comment on table public.compensation_plan_versions is
  '6E.2A: Template versions. Non-draft content is immutable; changes require a new version.';

comment on column public.compensation_plan_versions.organization_id is
  'Canonical tenant UUID; must match parent template organization_id.';

comment on column public.compensation_plan_versions.is_immutable is
  'Set true when leaving draft. Blocks content mutation via trigger.';

create index if not exists compensation_plan_versions_org_idx
  on public.compensation_plan_versions (organization_id);

create index if not exists compensation_plan_versions_template_idx
  on public.compensation_plan_versions (template_id, status);

create index if not exists compensation_plan_versions_org_status_idx
  on public.compensation_plan_versions (organization_id, status);

-- Align tenant with parent template
create or replace function public.enforce_pay_plan_version_tenant_and_activation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_template_org uuid;
begin
  select t.organization_id
  into v_template_org
  from public.compensation_plan_templates as t
  where t.id = new.template_id;

  if v_template_org is null then
    raise exception 'template_id introuvable'
      using errcode = '23503';
  end if;

  if new.organization_id is distinct from v_template_org then
    raise exception 'organization_id must match parent template'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      new.is_immutable := true;
    end if;
    if new.status in ('active', 'scheduled') and new.effective_from is null then
      raise exception 'effective_from is required before activation/scheduling'
        using errcode = '23514';
    end if;
    if new.status = 'active' and new.activated_at is null then
      new.activated_at := pg_catalog.timezone('utc', pg_catalog.now());
    end if;
    return new;
  end if;

  -- UPDATE
  if old.organization_id is distinct from new.organization_id then
    raise exception 'organization_id is immutable after insert'
      using errcode = '23514';
  end if;

  if old.template_id is distinct from new.template_id then
    raise exception 'template_id is immutable after insert'
      using errcode = '23514';
  end if;

  if old.version_number is distinct from new.version_number then
    raise exception 'version_number is immutable after insert'
      using errcode = '23514';
  end if;

  if old.status <> 'draft' or old.is_immutable then
    -- Allow only controlled status / closure fields
    if new.effective_from is distinct from old.effective_from then
      raise exception 'active/non-draft version effective_from is immutable'
        using errcode = '23514';
    end if;
    if new.change_reason is distinct from old.change_reason then
      raise exception 'non-draft version change_reason is immutable'
        using errcode = '23514';
    end if;
    if new.is_immutable is distinct from true then
      new.is_immutable := true;
    end if;
    if new.status in ('active', 'scheduled') and new.effective_from is null then
      raise exception 'effective_from is required before activation/scheduling'
        using errcode = '23514';
    end if;
  else
    -- Leaving draft locks content
    if new.status <> 'draft' then
      new.is_immutable := true;
      if new.effective_from is null then
        raise exception 'effective_from is required before activation/scheduling'
          using errcode = '23514';
      end if;
      if new.status = 'active' and new.activated_at is null then
        new.activated_at := pg_catalog.timezone('utc', pg_catalog.now());
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_pay_plan_version_tenant_and_activation() is
  '6E.2A: Tenant alignment + activation guards + non-draft content immutability.';

revoke all on function public.enforce_pay_plan_version_tenant_and_activation() from public;
revoke all on function public.enforce_pay_plan_version_tenant_and_activation() from anon;
revoke all on function public.enforce_pay_plan_version_tenant_and_activation() from authenticated;
grant execute on function public.enforce_pay_plan_version_tenant_and_activation() to service_role;

drop trigger if exists trg_compensation_plan_versions_enforce
  on public.compensation_plan_versions;
create trigger trg_compensation_plan_versions_enforce
  before insert or update on public.compensation_plan_versions
  for each row execute function public.enforce_pay_plan_version_tenant_and_activation();

create or replace function public.prevent_pay_plan_version_delete()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'compensation_plan_versions rows cannot be deleted; archive or cancel instead'
    using errcode = '23514';
end;
$$;

comment on function public.prevent_pay_plan_version_delete() is
  '6E.2A: Historical versions are retained; hard delete blocked.';

revoke all on function public.prevent_pay_plan_version_delete() from public;
revoke all on function public.prevent_pay_plan_version_delete() from anon;
revoke all on function public.prevent_pay_plan_version_delete() from authenticated;
grant execute on function public.prevent_pay_plan_version_delete() to service_role;

drop trigger if exists trg_compensation_plan_versions_no_delete
  on public.compensation_plan_versions;
create trigger trg_compensation_plan_versions_no_delete
  before delete on public.compensation_plan_versions
  for each row execute function public.prevent_pay_plan_version_delete();

-- Replace content-lock helper stub
create or replace function public.pay_plan_version_is_content_locked(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.compensation_plan_versions as v
    where v.id = p_version_id
      and (v.status <> 'draft' or v.is_immutable = true)
  );
$$;

comment on function public.pay_plan_version_is_content_locked(uuid) is
  '6E.2A: True when version is not draft or marked immutable.';

revoke all on function public.pay_plan_version_is_content_locked(uuid) from public;
revoke all on function public.pay_plan_version_is_content_locked(uuid) from anon;
grant execute on function public.pay_plan_version_is_content_locked(uuid) to authenticated;
grant execute on function public.pay_plan_version_is_content_locked(uuid) to service_role;

-- Optional FK from templates.current_version_id
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'compensation_plan_templates_current_version_id_fkey'
  ) then
    alter table public.compensation_plan_templates
      add constraint compensation_plan_templates_current_version_id_fkey
      foreign key (current_version_id)
      references public.compensation_plan_versions (id)
      on delete set null;
  end if;
end;
$$;

alter table public.compensation_plan_versions enable row level security;
alter table public.compensation_plan_versions force row level security;

revoke all on table public.compensation_plan_versions from public;
revoke all on table public.compensation_plan_versions from anon;
grant select, insert, update on table public.compensation_plan_versions to authenticated;
grant select, insert, update, delete on table public.compensation_plan_versions to service_role;

drop policy if exists compensation_plan_versions_select
  on public.compensation_plan_versions;
create policy compensation_plan_versions_select
  on public.compensation_plan_versions
  for select
  to authenticated
  using (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
    or public.user_has_pay_plan_permission(organization_id, 'commission_plan_assign')
    or public.user_has_pay_plan_permission(organization_id, 'commission_calculation_review')
    or public.user_has_pay_plan_permission(organization_id, 'commission_accounting')
    or public.user_has_pay_plan_permission(organization_id, 'commission_audit_read')
  );

drop policy if exists compensation_plan_versions_insert
  on public.compensation_plan_versions;
create policy compensation_plan_versions_insert
  on public.compensation_plan_versions
  for insert
  to authenticated
  with check (
    public.user_has_pay_plan_permission(organization_id, 'commission_plan_template_manage')
  );

drop policy if exists compensation_plan_versions_update
  on public.compensation_plan_versions;
create policy compensation_plan_versions_update
  on public.compensation_plan_versions
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
