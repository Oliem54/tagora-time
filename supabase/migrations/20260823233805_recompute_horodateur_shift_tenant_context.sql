-- Replace public.recompute_horodateur_shift so upserts into
-- horodateur_shifts include tenant keys from the matching chauffeur.
-- Signature, return type, and shift-calculation logic are preserved.
-- Fail-closed when an upsert is required but the chauffeur or required
-- tenant fields are missing. Does not change the trigger, RLS, or grants.

begin;

create or replace function public.recompute_horodateur_shift(p_employee_id bigint, p_work_date date)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_organization_id uuid;
  v_organization_company_id uuid;
  v_company_context text;
  v_chauffeur_found boolean := false;
  v_has_agg boolean := false;
  v_done integer;
begin
  select
    c.organization_id,
    c.organization_company_id,
    c.primary_company
  into
    v_organization_id,
    v_organization_company_id,
    v_company_context
  from public.chauffeurs c
  where c.id = p_employee_id;

  v_chauffeur_found := found;

  select exists (
    select 1
    from public.horodateur_events e
    where e.employee_id = p_employee_id
      and coalesce(e.work_date, (e.event_time at time zone 'utc')::date) = p_work_date
      and e.status <> 'refuse'::public.horodateur_event_status
  ) into v_has_agg;

  if v_has_agg then
    if not v_chauffeur_found then
      raise exception
        'recompute_horodateur_shift blocked: chauffeur % not found',
        p_employee_id;
    end if;

    if v_organization_id is null
       or v_organization_company_id is null
       or v_company_context is null
       or btrim(v_company_context) = '' then
      raise exception
        'recompute_horodateur_shift blocked: chauffeur % missing required tenant fields',
        p_employee_id;
    end if;
  end if;

  with existing_shift as (
    select id
    from public.horodateur_shifts
    where employee_id = p_employee_id
      and work_date = p_work_date
    limit 1
  ),
  base_events as (
    select
      e.id,
      e.employee_id,
      coalesce(e.work_date, (e.event_time at time zone 'utc')::date) as work_date,
      e.event_type,
      e.event_time
    from public.horodateur_events e
    where e.employee_id = p_employee_id
      and coalesce(e.work_date, (e.event_time at time zone 'utc')::date) = p_work_date
      and e.status <> 'refuse'::public.horodateur_event_status
  ),
  agg as (
    select
      employee_id,
      work_date,
      date_trunc('week', work_date::timestamp)::date as week_start_date,
      min(event_time) filter (
        where event_type in ('clock_in', 'shift_start')
      ) as shift_start_at,
      max(event_time) filter (
        where event_type in ('clock_out', 'shift_end')
      ) as shift_end_at
    from base_events
    group by employee_id, work_date
  ),
  break_starts as (
    select
      id,
      event_time,
      row_number() over (order by event_time, id) as rn
    from base_events
    where event_type in ('break_start', 'pause_start')
  ),
  break_ends as (
    select
      id,
      event_time,
      row_number() over (order by event_time, id) as rn
    from base_events
    where event_type in ('break_end', 'pause_end')
  ),
  break_pairs as (
    select
      greatest(0, floor(extract(epoch from (e.event_time - s.event_time)) / 60))::int as minutes
    from break_starts s
    join break_ends e
      on e.rn = s.rn
     and e.event_time > s.event_time
  ),
  lunch_starts as (
    select
      id,
      event_time,
      row_number() over (order by event_time, id) as rn
    from base_events
    where event_type in ('lunch_start', 'diner_start', 'dinner_start')
  ),
  lunch_ends as (
    select
      id,
      event_time,
      row_number() over (order by event_time, id) as rn
    from base_events
    where event_type in ('lunch_end', 'diner_end', 'dinner_end')
  ),
  lunch_pairs as (
    select
      greatest(0, floor(extract(epoch from (e.event_time - s.event_time)) / 60))::int as minutes
    from lunch_starts s
    join lunch_ends e
      on e.rn = s.rn
     and e.event_time > s.event_time
  ),
  stats as (
    select
      coalesce((select sum(minutes) from break_pairs), 0)::int as unpaid_break_minutes,
      coalesce((select sum(minutes) from lunch_pairs), 0)::int as unpaid_lunch_minutes,
      (
        abs((select count(*) from break_starts) - (select count(*) from break_ends))
        + abs((select count(*) from lunch_starts) - (select count(*) from lunch_ends))
      )::int as pair_anomalies
  ),
  exception_stats as (
    select
      coalesce(sum(
        case
          when x.status = 'approuve'::public.horodateur_exception_status
          then coalesce(x.approved_minutes, x.impact_minutes, 0)
          else 0
        end
      ), 0)::int as approved_exception_minutes,
      coalesce(sum(
        case
          when x.status = 'en_attente'::public.horodateur_exception_status
          then coalesce(x.impact_minutes, 0)
          else 0
        end
      ), 0)::int as pending_exception_minutes
    from public.horodateur_exceptions x
    where x.employee_id = p_employee_id
      and x.shift_id in (select id from existing_shift)
  ),
  deleted as (
    delete from public.horodateur_shifts s
    where s.employee_id = p_employee_id
      and s.work_date = p_work_date
      and not exists (select 1 from agg)
    returning 1
  ),
  upserted as (
    insert into public.horodateur_shifts (
      employee_id,
      work_date,
      week_start_date,
      company_context,
      shift_start_at,
      shift_end_at,
      gross_minutes,
      paid_break_minutes,
      unpaid_break_minutes,
      unpaid_lunch_minutes,
      worked_minutes,
      payable_minutes,
      approved_exception_minutes,
      pending_exception_minutes,
      anomalies_count,
      status,
      last_recomputed_at,
      organization_id,
      organization_company_id
    )
    select
      a.employee_id,
      a.work_date,
      a.week_start_date,
      v_company_context,
      a.shift_start_at,
      a.shift_end_at,
      case
        when a.shift_start_at is not null and a.shift_end_at is not null
        then greatest(0, floor(extract(epoch from (a.shift_end_at - a.shift_start_at)) / 60))::int
        else 0
      end as gross_minutes,
      0,
      s.unpaid_break_minutes,
      s.unpaid_lunch_minutes,
      case
        when a.shift_start_at is not null and a.shift_end_at is not null
        then greatest(
          0,
          floor(extract(epoch from (a.shift_end_at - a.shift_start_at)) / 60)::int
          - s.unpaid_break_minutes
          - s.unpaid_lunch_minutes
        )
        else 0
      end as worked_minutes,
      case
        when a.shift_start_at is not null and a.shift_end_at is not null
        then greatest(
          0,
          floor(extract(epoch from (a.shift_end_at - a.shift_start_at)) / 60)::int
          - s.unpaid_break_minutes
          - s.unpaid_lunch_minutes
        )
        else 0
      end as payable_minutes,
      ex.approved_exception_minutes,
      ex.pending_exception_minutes,
      (
        s.pair_anomalies
        + case
            when a.shift_start_at is not null and a.shift_end_at is null then 1
            else 0
          end
      )::int as anomalies_count,
      case
        when a.shift_start_at is not null and a.shift_end_at is null
        then 'ouvert'::public.horodateur_shift_status
        else 'ferme'::public.horodateur_shift_status
      end as status,
      timezone('utc'::text, now()),
      v_organization_id,
      v_organization_company_id
    from agg a
    cross join stats s
    cross join exception_stats ex
    on conflict (employee_id, work_date)
    do update set
      week_start_date = excluded.week_start_date,
      company_context = excluded.company_context,
      shift_start_at = excluded.shift_start_at,
      shift_end_at = excluded.shift_end_at,
      gross_minutes = excluded.gross_minutes,
      paid_break_minutes = excluded.paid_break_minutes,
      unpaid_break_minutes = excluded.unpaid_break_minutes,
      unpaid_lunch_minutes = excluded.unpaid_lunch_minutes,
      worked_minutes = excluded.worked_minutes,
      payable_minutes = excluded.payable_minutes,
      approved_exception_minutes = excluded.approved_exception_minutes,
      pending_exception_minutes = excluded.pending_exception_minutes,
      anomalies_count = excluded.anomalies_count,
      status = excluded.status,
      last_recomputed_at = excluded.last_recomputed_at,
      organization_id = excluded.organization_id,
      organization_company_id = excluded.organization_company_id,
      updated_at = timezone('utc'::text, now())
    returning 1
  )
  select coalesce((select 1 from deleted), (select 1 from upserted), 1)
  into v_done;
end;
$function$;

commit;
