-- Teach public.recompute_horodateur_current_state the stored event types.
-- quart_debut and dinner_fin map to en_quart, dinner_debut maps to en_diner,
-- and quart_fin maps to termine, only when status is normal or approuve.
-- A pending or refused quart_fin, dinner_debut, or dinner_fin is ignored, so
-- an automatic punch-out waiting for approval cannot close the live state.
-- clock_in, shift_start, clock_out, shift_end, dinner_start, and dinner_end
-- keep the previous rule. Does not change the trigger, RLS, or grants, and
-- does not rewrite punch rows or exception statuses.

begin;

create or replace function public.recompute_horodateur_current_state(p_employee_id bigint)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_organization_id uuid;
  v_organization_company_id uuid;
  v_company_context text;
  v_chauffeur_found boolean := false;
  v_has_latest boolean := false;
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
      and e.status <> 'refuse'::public.horodateur_event_status
  ) into v_has_latest;

  if v_has_latest then
    if not v_chauffeur_found then
      raise exception
        'recompute_horodateur_current_state blocked: chauffeur % not found',
        p_employee_id;
    end if;

    if v_organization_id is null
       or v_organization_company_id is null
       or v_company_context is null
       or btrim(v_company_context) = '' then
      raise exception
        'recompute_horodateur_current_state blocked: chauffeur % missing required tenant fields',
        p_employee_id;
    end if;
  end if;

  with latest as (
    select
      e.id as last_event_id,
      e.event_type as last_event_type,
      e.event_time as last_event_at,
      case
        when e.event_type in ('clock_in', 'shift_start', 'quart_debut', 'punch_in') then 'en_quart'::public.horodateur_state_kind
        when e.event_type in ('break_start', 'pause_start') then 'en_pause'::public.horodateur_state_kind
        when e.event_type in ('break_end', 'pause_end') then 'en_quart'::public.horodateur_state_kind
        when e.event_type in ('lunch_start', 'diner_start', 'dinner_start', 'dinner_debut') then 'en_diner'::public.horodateur_state_kind
        when e.event_type in ('lunch_end', 'diner_end', 'dinner_end', 'dinner_fin') then 'en_quart'::public.horodateur_state_kind
        when e.event_type in ('clock_out', 'shift_end', 'quart_fin', 'punch_out') then 'termine'::public.horodateur_state_kind
        else 'hors_quart'::public.horodateur_state_kind
      end as current_state
    from public.horodateur_events e
    where e.employee_id = p_employee_id
      and e.status <> 'refuse'::public.horodateur_event_status
      and not (
        e.event_type in (
          'quart_debut',
          'punch_in',
          'quart_fin',
          'punch_out',
          'dinner_debut',
          'dinner_fin'
        )
        and e.status not in (
          'normal'::public.horodateur_event_status,
          'approuve'::public.horodateur_event_status
        )
      )
    order by e.event_time desc nulls last, e.created_at desc nulls last, e.id desc
    limit 1
  ),
  open_exception as (
    select exists (
      select 1
      from public.horodateur_exceptions x
      where x.employee_id = p_employee_id
        and x.status = 'en_attente'::public.horodateur_exception_status
    ) as has_open_exception
  ),
  deleted as (
    delete from public.horodateur_current_state
    where employee_id = p_employee_id
      and not exists (select 1 from latest)
    returning 1
  ),
  upserted as (
    insert into public.horodateur_current_state (
      employee_id,
      current_state,
      last_event_id,
      last_event_type,
      last_event_at,
      has_open_exception,
      organization_id,
      organization_company_id,
      company_context
    )
    select
      p_employee_id,
      l.current_state,
      l.last_event_id,
      l.last_event_type,
      l.last_event_at,
      o.has_open_exception,
      v_organization_id,
      v_organization_company_id,
      v_company_context
    from latest l
    cross join open_exception o
    on conflict (employee_id)
    do update set
      current_state = excluded.current_state,
      last_event_id = excluded.last_event_id,
      last_event_type = excluded.last_event_type,
      last_event_at = excluded.last_event_at,
      has_open_exception = excluded.has_open_exception,
      organization_id = excluded.organization_id,
      organization_company_id = excluded.organization_company_id,
      company_context = excluded.company_context,
      updated_at = timezone('utc'::text, now())
    returning 1
  )
  select coalesce((select 1 from deleted), (select 1 from upserted), 1)
  into v_done;
end;
$function$;

commit;
