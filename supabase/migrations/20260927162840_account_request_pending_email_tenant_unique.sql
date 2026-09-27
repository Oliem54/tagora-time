-- Pending account-request uniqueness is limited to one organization and one company.
--
-- Company rule: the same normalized email may be pending in two companies of the
-- same organization, and in two organizations. A second pending row in the same
-- organization and the same company is refused. Only status pending is unique.
-- invited, active, refused, and error stay outside this index.
--
-- Legacy rows with a null organization_id or organization_company_id stay stored.
-- They are excluded from the index and are not updated or removed.
--
-- New inserts without both scope columns are rejected. Between this migration and
-- the deploy that writes those columns, the currently served application receives
-- a controlled error and does not store an unscoped row.
--
-- Index impact: CREATE INDEX is not CONCURRENTLY, so it takes a brief ShareLock.
-- lock_timeout makes a busy table fail the migration instead of waiting.
-- DROP INDEX removes only the global email index. It does not remove rows.

set local lock_timeout = '4s';
set local statement_timeout = '30s';

drop index if exists public.uq_account_requests_pending_email;

create unique index if not exists uq_account_requests_pending_email_tenant_company
  on public.account_requests (organization_id, organization_company_id, lower(email))
  where status = 'pending'
    and organization_id is not null
    and organization_company_id is not null;

create or replace function public.account_requests_guard_scope()
returns trigger
language plpgsql
security invoker
as $$
begin
  if tg_op = 'INSERT' then
    if new.organization_id is null or new.organization_company_id is null then
      raise exception 'account_request_scope_required'
        using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.organization_id is not null
      and old.organization_company_id is not null
      and (new.organization_id is null or new.organization_company_id is null)
    then
      raise exception 'account_request_scope_required'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_account_requests_guard_scope on public.account_requests;
create trigger trg_account_requests_guard_scope
  before insert or update on public.account_requests
  for each row execute function public.account_requests_guard_scope();

comment on index public.uq_account_requests_pending_email_tenant_company is
  'One pending email per organization and company. Other companies and tenants may reuse the email. Null-scope legacy rows are excluded.';
