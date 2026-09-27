-- Additive tenant and company scope for commission sale lines and account requests.
-- Does not delete or overwrite existing rows. Unscoped rows stay stored and fail closed.
--
-- Index impact: CREATE INDEX is not CONCURRENTLY, so it takes a brief ShareLock
-- inside this transaction. lock_timeout makes a busy table fail the migration
-- instead of waiting. account_requests is an existing table; commission_sale_lines
-- is new and small. No prolonged lock is requested.
--
-- Production backfill is a separate gate. Do not run it from this file.
-- Count account_requests and commission_sale_lines where organization_id is null
-- or organization_company_id is null. Map a company code only when exactly one
-- active organization_companies row has that code. Update only those null scope
-- columns. Leave ambiguous rows null. No delete.

set local lock_timeout = '4s';
set local statement_timeout = '30s';

alter table public.commission_sale_lines
  add column if not exists organization_id uuid null,
  add column if not exists organization_company_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'commission_sale_lines_organization_id_fkey'
      and conrelid = 'public.commission_sale_lines'::regclass
  ) then
    alter table public.commission_sale_lines
      add constraint commission_sale_lines_organization_id_fkey
      foreign key (organization_id)
      references public.organizations (id)
      on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'commission_sale_lines_company_scope_fkey'
      and conrelid = 'public.commission_sale_lines'::regclass
  ) then
    alter table public.commission_sale_lines
      add constraint commission_sale_lines_company_scope_fkey
      foreign key (organization_company_id, organization_id)
      references public.organization_companies (id, organization_id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists idx_commission_sale_lines_tenant_company
  on public.commission_sale_lines (organization_id, organization_company_id, objective_id);

comment on column public.commission_sale_lines.organization_id is
  'Tenant UUID copied from the verified server session and the objective. Null rows are legacy and invisible.';

comment on column public.commission_sale_lines.organization_company_id is
  'Company UUID inside the tenant. Null rows are legacy and invisible.';

create or replace function public.commission_sale_lines_guard_write()
returns trigger
language plpgsql
security invoker
as $$
begin
  if new.organization_id is null or new.organization_company_id is null then
    raise exception 'commission_sale_line_scope_required';
  end if;

  if not exists (
    select 1
    from public.organization_companies oc
    where oc.id = new.organization_company_id
      and oc.organization_id = new.organization_id
  ) then
    raise exception 'commission_sale_line_company_mismatch';
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
      or new.organization_company_id is distinct from old.organization_company_id
      or new.objective_id is distinct from old.objective_id
      or new.kind is distinct from old.kind
      or new.amount is distinct from old.amount
      or new.sales_count is distinct from old.sales_count
      or new.created_by is distinct from old.created_by
      or new.corrects_line_id is distinct from old.corrects_line_id
    then
      raise exception 'commission_sale_line_immutable_field';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_commission_sale_lines_guard_write on public.commission_sale_lines;
create trigger trg_commission_sale_lines_guard_write
  before insert or update on public.commission_sale_lines
  for each row execute function public.commission_sale_lines_guard_write();

alter table public.commission_sale_lines enable row level security;
alter table public.commission_sale_lines force row level security;

revoke all on table public.commission_sale_lines from public;
revoke all on table public.commission_sale_lines from anon;

drop policy if exists "commission_sale_lines_select" on public.commission_sale_lines;
drop policy if exists "commission_sale_lines_insert" on public.commission_sale_lines;
drop policy if exists "commission_sale_lines_update" on public.commission_sale_lines;
drop policy if exists "commission_sale_lines_direction_select" on public.commission_sale_lines;
drop policy if exists "commission_sale_lines_direction_insert" on public.commission_sale_lines;
drop policy if exists "commission_sale_lines_direction_update" on public.commission_sale_lines;
drop policy if exists "commission_sale_lines_employee_select" on public.commission_sale_lines;

create policy "commission_sale_lines_direction_select"
  on public.commission_sale_lines
  for select
  to authenticated
  using (
    organization_id is not null
    and organization_company_id is not null
    and public.current_user_can_access_organization(organization_id)
    and exists (
      select 1
      from public.organization_companies oc
      where oc.id = commission_sale_lines.organization_company_id
        and oc.organization_id = commission_sale_lines.organization_id
    )
    and (
      (
        public.is_direction_user()
        and public.has_app_permission('commissions')
      )
      or public.is_admin_user()
    )
  );

create policy "commission_sale_lines_employee_select"
  on public.commission_sale_lines
  for select
  to authenticated
  using (
    organization_id is not null
    and organization_company_id is not null
    and public.current_app_role() = 'employe'
    and exists (
      select 1
      from public.sales_objectives o
      join public.chauffeurs c on c.id = o.chauffeur_id
      where o.id = commission_sale_lines.objective_id
        and c.auth_user_id = (select auth.uid())
        and c.id = public.current_employee_chauffeur_id()
        and c.organization_id = commission_sale_lines.organization_id
        and c.organization_company_id = commission_sale_lines.organization_company_id
    )
  );

create policy "commission_sale_lines_direction_insert"
  on public.commission_sale_lines
  for insert
  to authenticated
  with check (
    organization_id is not null
    and organization_company_id is not null
    and public.current_user_can_access_organization(organization_id)
    and exists (
      select 1
      from public.organization_companies oc
      where oc.id = commission_sale_lines.organization_company_id
        and oc.organization_id = commission_sale_lines.organization_id
    )
    and (
      (
        public.is_direction_user()
        and public.has_app_permission('commissions')
      )
      or public.is_admin_user()
    )
  );

create policy "commission_sale_lines_direction_update"
  on public.commission_sale_lines
  for update
  to authenticated
  using (
    organization_id is not null
    and organization_company_id is not null
    and public.current_user_can_access_organization(organization_id)
    and (
      (
        public.is_direction_user()
        and public.has_app_permission('commissions')
      )
      or public.is_admin_user()
    )
  )
  with check (
    organization_id is not null
    and organization_company_id is not null
    and public.current_user_can_access_organization(organization_id)
    and exists (
      select 1
      from public.organization_companies oc
      where oc.id = commission_sale_lines.organization_company_id
        and oc.organization_id = commission_sale_lines.organization_id
    )
    and (
      (
        public.is_direction_user()
        and public.has_app_permission('commissions')
      )
      or public.is_admin_user()
    )
  );

grant select, insert, update on table public.commission_sale_lines to authenticated;
grant select, insert, update on table public.commission_sale_lines to service_role;

alter table public.account_requests
  add column if not exists organization_id uuid null,
  add column if not exists organization_company_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_requests_organization_id_fkey'
      and conrelid = 'public.account_requests'::regclass
  ) then
    alter table public.account_requests
      add constraint account_requests_organization_id_fkey
      foreign key (organization_id)
      references public.organizations (id)
      on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_requests_company_scope_fkey'
      and conrelid = 'public.account_requests'::regclass
  ) then
    alter table public.account_requests
      add constraint account_requests_company_scope_fkey
      foreign key (organization_company_id, organization_id)
      references public.organization_companies (id, organization_id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists idx_account_requests_tenant_company
  on public.account_requests (organization_id, organization_company_id, created_at desc);

comment on column public.account_requests.organization_id is
  'Tenant UUID from the verified server session. Null legacy rows stay stored and are invisible.';

comment on column public.account_requests.organization_company_id is
  'Company UUID inside the tenant. Null legacy rows stay stored and are invisible.';

alter table public.account_requests enable row level security;
alter table public.account_requests force row level security;

revoke all on table public.account_requests from public;
revoke all on table public.account_requests from anon;

drop policy if exists account_requests_insert_pending_public_h5e2b on public.account_requests;
drop policy if exists account_requests_select_direction_admin_h5e2b on public.account_requests;
drop policy if exists account_requests_update_direction_admin_h5e2b on public.account_requests;
drop policy if exists account_requests_delete_direction_admin_h5e2b on public.account_requests;
drop policy if exists account_requests_select_tenant_company on public.account_requests;
drop policy if exists account_requests_update_tenant_company on public.account_requests;
drop policy if exists account_requests_delete_tenant_company on public.account_requests;

create policy account_requests_select_tenant_company
  on public.account_requests
  for select
  to authenticated
  using (
    organization_id is not null
    and organization_company_id is not null
    and public.current_user_can_access_organization(organization_id)
    and public.is_direction_or_admin()
    and exists (
      select 1
      from public.organization_companies oc
      where oc.id = account_requests.organization_company_id
        and oc.organization_id = account_requests.organization_id
    )
  );

create policy account_requests_update_tenant_company
  on public.account_requests
  for update
  to authenticated
  using (
    organization_id is not null
    and organization_company_id is not null
    and public.current_user_can_access_organization(organization_id)
    and public.is_direction_or_admin()
  )
  with check (
    organization_id is not null
    and organization_company_id is not null
    and public.current_user_can_access_organization(organization_id)
    and public.is_direction_or_admin()
    and exists (
      select 1
      from public.organization_companies oc
      where oc.id = account_requests.organization_company_id
        and oc.organization_id = account_requests.organization_id
    )
  );

create policy account_requests_delete_tenant_company
  on public.account_requests
  for delete
  to authenticated
  using (
    organization_id is not null
    and organization_company_id is not null
    and public.current_user_can_access_organization(organization_id)
    and public.is_direction_or_admin()
    and exists (
      select 1
      from public.organization_companies oc
      where oc.id = account_requests.organization_company_id
        and oc.organization_id = account_requests.organization_id
    )
  );

grant select, update, delete on table public.account_requests to authenticated;
grant select, insert, update, delete on table public.account_requests to service_role;

notify pgrst, 'reload schema';
