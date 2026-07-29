-- 6D security hardening: revoke direct EXECUTE on SECURITY DEFINER tenant trigger function.
-- Triggers continue to fire; PUBLIC/anon/authenticated must not call the function directly.
-- No function body change, no trigger recreate, no table/RLS/chauffeurs changes.

revoke all on function public.enforce_employee_compensation_plan_tenant() from public;
revoke all on function public.enforce_employee_compensation_plan_tenant() from anon;
revoke all on function public.enforce_employee_compensation_plan_tenant() from authenticated;
