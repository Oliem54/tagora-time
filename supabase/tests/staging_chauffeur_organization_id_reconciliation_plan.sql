-- SELECT-ONLY staging reconciliation plan for canonical tenant UUID bridge.
-- Option C — NO writes. NO hardcoded environment UUIDs. NO automatic APPLY.
-- Run manually on staging after GO Martin only.
--
-- Inventories:
--   1) chauffeurs.organization_id proposals (evidence scored; never auto-applied)
--   2) sales_objectives tenant state (matched / mismatch / team_unassigned / unresolved)
--   3) commission_entries tenant state (same statuses)
--
-- primary_company / company_context are informational hints only — never sufficient proof.

-- =============================================================================
-- A. Active organizations (candidates)
-- =============================================================================
select
  o.id as organization_id,
  o.slug,
  o.display_name,
  o.status,
  o.deleted_at
from public.organizations o
order by o.status, o.slug;

-- =============================================================================
-- B. Chauffeurs proposal matrix (read-only)
-- =============================================================================
with orgs as (
  select
    o.id,
    o.slug,
    lower(replace(o.slug, '-', '_')) as slug_norm,
    o.status,
    o.deleted_at
  from public.organizations o
),
membership_hits as (
  select
    c.id as chauffeur_id,
    m.organization_id,
    'membership_active'::text as evidence,
    100 as score
  from public.chauffeurs c
  join public.organization_memberships m
    on m.user_id = c.auth_user_id
   and m.status = 'active'
  join orgs o
    on o.id = m.organization_id
   and o.status = 'active'
   and o.deleted_at is null
  where c.auth_user_id is not null
),
slug_hits as (
  select
    c.id as chauffeur_id,
    o.id as organization_id,
    'slug_eq_primary_company'::text as evidence,
    60 as score
  from public.chauffeurs c
  join orgs o
    on o.slug_norm = lower(replace(coalesce(c.primary_company, ''), '-', '_'))
   and o.status = 'active'
   and o.deleted_at is null
  where nullif(btrim(c.primary_company), '') is not null
),
all_hits as (
  select * from membership_hits
  union all
  select * from slug_hits
),
scored as (
  select
    chauffeur_id,
    organization_id,
    sum(score) as total_score,
    array_agg(distinct evidence order by evidence) as evidence_list
  from all_hits
  group by chauffeur_id, organization_id
),
top_score as (
  select chauffeur_id, max(total_score) as max_score
  from scored
  group by chauffeur_id
),
top_candidates as (
  select s.*
  from scored s
  join top_score t
    on t.chauffeur_id = s.chauffeur_id
   and t.max_score = s.total_score
),
ambiguous as (
  select chauffeur_id
  from top_candidates
  group by chauffeur_id
  having count(*) > 1
)
select
  c.id as chauffeur_id,
  c.nom,
  c.auth_user_id,
  c.primary_company,
  c.organization_id as current_organization_id,
  tc.organization_id as proposed_organization_id,
  o.slug as proposed_slug,
  tc.total_score,
  tc.evidence_list,
  case
    when c.organization_id is not null then 'already_set'
    when tc.chauffeur_id is null then 'unmatched'
    when a.chauffeur_id is not null then 'ambiguous'
    else 'proposed'
  end as reconciliation_status
from public.chauffeurs c
left join top_candidates tc
  on tc.chauffeur_id = c.id
left join ambiguous a
  on a.chauffeur_id = c.id
left join public.organizations o
  on o.id = tc.organization_id
order by reconciliation_status, c.id;

-- =============================================================================
-- C. sales_objectives tenant inventory (read-only)
-- Status meanings:
--   matched          — chauffeur present and row.organization_id null or equals chauffeur org
--   mismatch         — chauffeur present and row.organization_id differs from chauffeur org
--   team_unassigned  — chauffeur_id null and row.organization_id null
--   unresolved       — chauffeur present but chauffeur.organization_id null
--   team_assigned    — chauffeur_id null and row.organization_id not null (informational)
-- =============================================================================
select
  so.id as objective_id,
  so.title,
  so.chauffeur_id,
  so.team_name,
  so.organization_id as current_organization_id,
  c.organization_id as chauffeur_derived_organization_id,
  so.company_context as company_context_informational,
  c.primary_company as primary_company_informational,
  case
    when so.chauffeur_id is not null and c.id is null then 'unresolved'
    when so.chauffeur_id is not null and c.organization_id is null then 'unresolved'
    when so.chauffeur_id is not null
      and (
        so.organization_id is null
        or so.organization_id = c.organization_id
      )
      then 'matched'
    when so.chauffeur_id is not null
      and so.organization_id is distinct from c.organization_id
      then 'mismatch'
    when so.chauffeur_id is null and so.organization_id is null then 'team_unassigned'
    when so.chauffeur_id is null and so.organization_id is not null then 'team_assigned'
    else 'unresolved'
  end as reconciliation_status
from public.sales_objectives so
left join public.chauffeurs c
  on c.id = so.chauffeur_id
order by reconciliation_status, so.id;

-- =============================================================================
-- D. commission_entries tenant inventory (read-only)
-- =============================================================================
select
  ce.id as entry_id,
  ce.objective_id,
  ce.chauffeur_id,
  ce.organization_id as current_organization_id,
  c.organization_id as chauffeur_derived_organization_id,
  so.company_context as company_context_informational,
  c.primary_company as primary_company_informational,
  case
    when ce.chauffeur_id is not null and c.id is null then 'unresolved'
    when ce.chauffeur_id is not null and c.organization_id is null then 'unresolved'
    when ce.chauffeur_id is not null
      and (
        ce.organization_id is null
        or ce.organization_id = c.organization_id
      )
      then 'matched'
    when ce.chauffeur_id is not null
      and ce.organization_id is distinct from c.organization_id
      then 'mismatch'
    when ce.chauffeur_id is null and ce.organization_id is null then 'team_unassigned'
    when ce.chauffeur_id is null and ce.organization_id is not null then 'team_assigned'
    else 'unresolved'
  end as reconciliation_status
from public.commission_entries ce
left join public.chauffeurs c
  on c.id = ce.chauffeur_id
left join public.sales_objectives so
  on so.id = ce.objective_id
order by reconciliation_status, ce.id;

-- =============================================================================
-- E. Forbidden automatic write (documentation only)
-- =============================================================================
-- Never:
--   update public.chauffeurs set organization_id = '<staging-uuid>';
--   update public.sales_objectives set organization_id = ... where chauffeur_id is null;
--   update ... where (select count(*) from organizations where status='active') = 1;
-- Require Martin GO + reviewed proposal sets only (exclude ambiguous/unmatched/mismatch).
