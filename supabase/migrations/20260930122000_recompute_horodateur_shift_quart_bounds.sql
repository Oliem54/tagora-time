-- Teach public.recompute_horodateur_shift the stored quart, dinner, and pause
-- types. quart_debut / punch_in and quart_fin / punch_out count as shift bounds
-- only when status is normal or approuve. dinner_debut / dinner_fin and
-- pause_debut / pause_fin count on the same rule, at coalesce(occurred_at,
-- event_time). Those minutes are subtracted only when the pause or dinner is
-- unpaid: break_1_paid false for pauses, lunch_paid false for dinners.
-- shift_start_at stays the first real punch. A later approved start on the
-- same work date clears shift_end_at until that new segment has its own exit,
-- so the current shift stays open. Worked and payable minutes sum the closed
-- segments. Each segment clamps its own start to chauffeurs.schedule_start in
-- America/Toronto when the punch local minutes are earlier on the same work
-- date. The off-duty gap between segments is not payable. Gross minutes stay
-- on the stored bounds. A null schedule_start does not clamp. Pending and
-- refused stored types stay out of those bounds.
-- clock_in, shift_start, clock_out, shift_end, break_start, pause_start,
-- break_end, pause_end, dinner_start, and dinner_end keep the previous rule.
-- Does not change the trigger, RLS, or grants, and does not rewrite punch
-- rows or exception statuses.

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
  v_pause_paid boolean := true;
  v_lunch_paid boolean := false;
  v_schedule_start time;
  v_has_agg boolean := false;
  v_done integer;
begin
  select
    c.organization_id,
    c.organization_company_id,
    c.primary_company,
    coalesce(c.break_1_paid, true),
    coalesce(c.lunch_paid, false),
    c.schedule_start
  into
    v_organization_id,
    v_organization_company_id,
    v_company_context,
    v_pause_paid,
    v_lunch_paid,
    v_schedule_start
  from public.chauffeurs c
  where c.id = p_employee_id;

  v_chauffeur_found := found;
  v_pause_paid := coalesce(v_pause_paid, true);
  v_lunch_paid := coalesce(v_lunch_paid, false);

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

  with recursive existing_shift as (
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
      e.status,
      e.event_time,
      e.occurred_at
    from public.horodateur_events e
    where e.employee_id = p_employee_id
      and coalesce(e.work_date, (e.event_time at time zone 'utc')::date) = p_work_date
      and e.status <> 'refuse'::public.horodateur_event_status
  ),
  ordered_bounds as (
    select
      id,
      bound_at,
      bound_kind,
      row_number() over (
        order by bound_at, case when bound_kind = 'start' then 0 else 1 end, id
      ) as rn
    from (
      select
        id,
        case
          when event_type in ('clock_in', 'shift_start') then event_time
          when event_type in ('quart_debut', 'punch_in')
            and status in (
              'normal'::public.horodateur_event_status,
              'approuve'::public.horodateur_event_status
            )
            then coalesce(occurred_at, event_time)
          else null
        end as bound_at,
        'start'::text as bound_kind
      from base_events
      where event_type in ('clock_in', 'shift_start', 'quart_debut', 'punch_in')
      union all
      select
        id,
        case
          when event_type in ('clock_out', 'shift_end') then event_time
          when event_type in ('quart_fin', 'punch_out')
            and status in (
              'normal'::public.horodateur_event_status,
              'approuve'::public.horodateur_event_status
            )
            then coalesce(occurred_at, event_time)
          else null
        end as bound_at,
        'end'::text as bound_kind
      from base_events
      where event_type in ('clock_out', 'shift_end', 'quart_fin', 'punch_out')
    ) raw_bounds
    where bound_at is not null
  ),
  segment_walk as (
    select
      rn,
      bound_at,
      bound_kind,
      case
        when bound_kind = 'start' then bound_at
        else null::timestamp with time zone
      end as shift_start_at,
      case
        when bound_kind = 'end' then bound_at
        else null::timestamp with time zone
      end as shift_end_at,
      case
        when bound_kind = 'start' then bound_at
        else null::timestamp with time zone
      end as segment_start_at,
      case
        when bound_kind = 'start' then
          case
            when v_schedule_start is null then bound_at
            when (bound_at at time zone 'America/Toronto')::date <> p_work_date then bound_at
            when (
              extract(hour from (bound_at at time zone 'America/Toronto'))::int * 60
              + extract(minute from (bound_at at time zone 'America/Toronto'))::int
            ) >= (
              extract(hour from v_schedule_start)::int * 60
              + extract(minute from v_schedule_start)::int
            )
              then bound_at
            else (p_work_date + v_schedule_start) at time zone 'America/Toronto'
          end
        else null::timestamp with time zone
      end as segment_payable_start_at,
      0::int as closed_payable_minutes
    from ordered_bounds
    where rn = 1
    union all
    select
      o.rn,
      o.bound_at,
      o.bound_kind,
      case
        when w.shift_start_at is null and o.bound_kind = 'start' then o.bound_at
        else w.shift_start_at
      end as shift_start_at,
      case
        when o.bound_kind = 'start' and w.shift_end_at is not null then null
        when o.bound_kind = 'end'
          and w.segment_start_at is not null
          and o.bound_at >= w.segment_start_at
          and (w.shift_end_at is null or o.bound_at > w.shift_end_at)
          then o.bound_at
        when o.bound_kind = 'end'
          and w.segment_start_at is null
          and (w.shift_end_at is null or o.bound_at > w.shift_end_at)
          then o.bound_at
        else w.shift_end_at
      end as shift_end_at,
      case
        when o.bound_kind = 'start'
          and (w.shift_start_at is null or w.shift_end_at is not null)
          then o.bound_at
        else w.segment_start_at
      end as segment_start_at,
      case
        when o.bound_kind = 'start'
          and (w.shift_start_at is null or w.shift_end_at is not null)
          then
            case
              when v_schedule_start is null then o.bound_at
              when (o.bound_at at time zone 'America/Toronto')::date <> p_work_date then o.bound_at
              when (
                extract(hour from (o.bound_at at time zone 'America/Toronto'))::int * 60
                + extract(minute from (o.bound_at at time zone 'America/Toronto'))::int
              ) >= (
                extract(hour from v_schedule_start)::int * 60
                + extract(minute from v_schedule_start)::int
              )
                then o.bound_at
              else (p_work_date + v_schedule_start) at time zone 'America/Toronto'
            end
        else w.segment_payable_start_at
      end as segment_payable_start_at,
      (
        w.closed_payable_minutes
        + case
            when o.bound_kind = 'end'
              and w.segment_start_at is not null
              and w.segment_payable_start_at is not null
              and o.bound_at >= w.segment_start_at
              and (w.shift_end_at is null or o.bound_at > w.shift_end_at)
            then greatest(
              0,
              floor(extract(epoch from (o.bound_at - w.segment_payable_start_at)) / 60)::int
              - case
                  when w.shift_end_at is not null
                  then greatest(
                    0,
                    floor(extract(epoch from (w.shift_end_at - w.segment_payable_start_at)) / 60)::int
                  )
                  else 0
                end
            )
            else 0
          end
      )::int as closed_payable_minutes
    from segment_walk w
    join ordered_bounds o on o.rn = w.rn + 1
  ),
  agg as (
    select
      be.employee_id,
      be.work_date,
      date_trunc('week', be.work_date::timestamp)::date as week_start_date,
      w.shift_start_at,
      w.shift_end_at,
      coalesce(w.closed_payable_minutes, 0) as closed_payable_minutes
    from (
      select distinct employee_id, work_date
      from base_events
    ) be
    left join segment_walk w
      on w.rn = (select max(rn) from ordered_bounds)
  ),
  payable as (
    select
      a.employee_id,
      a.work_date,
      a.week_start_date,
      a.shift_start_at,
      a.shift_end_at,
      a.closed_payable_minutes,
      case
        when a.shift_start_at is null or v_schedule_start is null then a.shift_start_at
        when (a.shift_start_at at time zone 'America/Toronto')::date <> a.work_date
          then a.shift_start_at
        when (
          extract(hour from (a.shift_start_at at time zone 'America/Toronto'))::int * 60
          + extract(minute from (a.shift_start_at at time zone 'America/Toronto'))::int
        ) >= (
          extract(hour from v_schedule_start)::int * 60
          + extract(minute from v_schedule_start)::int
        )
          then a.shift_start_at
        else (a.work_date + v_schedule_start) at time zone 'America/Toronto'
      end as payable_start_at
    from agg a
  ),
  break_starts as (
    select
      id,
      bound_at as event_time,
      row_number() over (order by bound_at, id) as rn
    from (
      select
        id,
        case
          when event_type in ('break_start', 'pause_start') then event_time
          when event_type = 'pause_debut'
            and status in (
              'normal'::public.horodateur_event_status,
              'approuve'::public.horodateur_event_status
            )
            then coalesce(occurred_at, event_time)
          else null
        end as bound_at
      from base_events
      where event_type in ('break_start', 'pause_start', 'pause_debut')
    ) break_start_bounds
    where bound_at is not null
  ),
  break_ends as (
    select
      id,
      bound_at as event_time,
      row_number() over (order by bound_at, id) as rn
    from (
      select
        id,
        case
          when event_type in ('break_end', 'pause_end') then event_time
          when event_type = 'pause_fin'
            and status in (
              'normal'::public.horodateur_event_status,
              'approuve'::public.horodateur_event_status
            )
            then coalesce(occurred_at, event_time)
          else null
        end as bound_at
      from base_events
      where event_type in ('break_end', 'pause_end', 'pause_fin')
    ) break_end_bounds
    where bound_at is not null
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
      bound_at as event_time,
      row_number() over (order by bound_at, id) as rn
    from (
      select
        id,
        case
          when event_type in ('lunch_start', 'diner_start', 'dinner_start') then event_time
          when event_type = 'dinner_debut'
            and status in (
              'normal'::public.horodateur_event_status,
              'approuve'::public.horodateur_event_status
            )
            then coalesce(occurred_at, event_time)
          else null
        end as bound_at
      from base_events
      where event_type in (
        'lunch_start',
        'diner_start',
        'dinner_start',
        'dinner_debut'
      )
    ) lunch_start_bounds
    where bound_at is not null
  ),
  lunch_ends as (
    select
      id,
      bound_at as event_time,
      row_number() over (order by bound_at, id) as rn
    from (
      select
        id,
        case
          when event_type in ('lunch_end', 'diner_end', 'dinner_end') then event_time
          when event_type = 'dinner_fin'
            and status in (
              'normal'::public.horodateur_event_status,
              'approuve'::public.horodateur_event_status
            )
            then coalesce(occurred_at, event_time)
          else null
        end as bound_at
      from base_events
      where event_type in (
        'lunch_end',
        'diner_end',
        'dinner_end',
        'dinner_fin'
      )
    ) lunch_end_bounds
    where bound_at is not null
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
      case
        when v_pause_paid then 0
        else coalesce((select sum(minutes) from break_pairs), 0)
      end::int as unpaid_break_minutes,
      case
        when v_lunch_paid then 0
        else coalesce((select sum(minutes) from lunch_pairs), 0)
      end::int as unpaid_lunch_minutes,
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
      p.employee_id,
      p.work_date,
      p.week_start_date,
      v_company_context,
      p.shift_start_at,
      p.shift_end_at,
      case
        when p.shift_start_at is not null and p.shift_end_at is not null
        then greatest(0, floor(extract(epoch from (p.shift_end_at - p.shift_start_at)) / 60))::int
        else 0
      end as gross_minutes,
      0,
      s.unpaid_break_minutes,
      s.unpaid_lunch_minutes,
      greatest(
        0,
        p.closed_payable_minutes
        - s.unpaid_break_minutes
        - s.unpaid_lunch_minutes
      ) as worked_minutes,
      greatest(
        0,
        p.closed_payable_minutes
        - s.unpaid_break_minutes
        - s.unpaid_lunch_minutes
      ) as payable_minutes,
      ex.approved_exception_minutes,
      ex.pending_exception_minutes,
      (
        s.pair_anomalies
        + case
            when p.shift_start_at is not null and p.shift_end_at is null then 1
            else 0
          end
      )::int as anomalies_count,
      case
        when p.shift_start_at is not null and p.shift_end_at is null
        then 'ouvert'::public.horodateur_shift_status
        else 'ferme'::public.horodateur_shift_status
      end as status,
      timezone('utc'::text, now()),
      v_organization_id,
      v_organization_company_id
    from payable p
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
