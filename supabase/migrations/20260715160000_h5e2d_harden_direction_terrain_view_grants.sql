-- ============================================================
-- H5-E2D forward-only — harden grants on direction_terrain_positions
--
-- Scope: ACL on public.direction_terrain_positions ONLY.
-- Preserves H5-D2 view definition byte-for-byte (no CREATE/DROP/REPLACE).
--
-- Target ACL:
--   PUBLIC        : none
--   anon          : none
--   authenticated : SELECT only
--   service_role  : SELECT only
--   owner postgres: unchanged
--
-- Forbidden: VIEW DDL, policies, helpers, underlying grants/tables,
-- H5-E2A/B/C edits, H5-F, H4, SECURITY DEFINER, data.
-- Rollback: restore ACL from TEMP snapshots under separate mandate.
-- ============================================================

begin;

do $$
declare
  v_oid oid;
  v_relkind "char";
  v_owner text;
  v_opts text[];
  v_def text;
  v_cols text[];
  expected text[] := array[
    'id',
    'source_kind',
    'source_label',
    'user_id',
    'chauffeur_id',
    'company_context',
    'company_directory_context',
    'latitude',
    'longitude',
    'speed_kmh',
    'gps_status',
    'activity_label',
    'sortie_id',
    'livraison_id',
    'horodateur_event_id',
    'intervention_label',
    'metadata',
    'recorded_at'
  ];
begin
  select c.oid, c.relkind, pg_get_userbyid(c.relowner), coalesce(c.reloptions, array[]::text[])
  into v_oid, v_relkind, v_owner, v_opts
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'direction_terrain_positions';

  if v_oid is null then
    raise exception 'H5-E2D STOP: missing public.direction_terrain_positions';
  end if;
  if v_relkind <> 'v' then
    raise exception 'H5-E2D STOP: direction_terrain_positions relkind=% (expected v)', v_relkind;
  end if;
  if v_owner is distinct from 'postgres' then
    raise exception 'H5-E2D STOP: unexpected owner=% (expected postgres)', v_owner;
  end if;
  if not (
    'security_invoker=true' = any (v_opts)
    or 'security_invoker=on' = any (v_opts)
  ) then
    raise exception 'H5-E2D STOP: security_invoker not true on view';
  end if;

  select array_agg(a.attname::text order by a.attnum)
  into v_cols
  from pg_attribute a
  where a.attrelid = v_oid
    and a.attnum > 0
    and not a.attisdropped;

  if v_cols is distinct from expected then
    raise exception 'H5-E2D STOP: column contract mismatch (got %)', v_cols;
  end if;

  -- id must remain text
  if (
    select pg_catalog.format_type(a.atttypid, a.atttypmod)
    from pg_attribute a
    where a.attrelid = v_oid and a.attname = 'id'
  ) is distinct from 'text' then
    raise exception 'H5-E2D STOP: id column must be type text';
  end if;

  v_def := lower(pg_get_viewdef(v_oid, true));

  if position('union all' in v_def) = 0 then
    raise exception 'H5-E2D STOP: missing UNION ALL branches';
  end if;
  if (length(v_def) - length(replace(v_def, 'union all', ''))) / length('union all') <> 3 then
    raise exception 'H5-E2D STOP: expected exactly 3 UNION ALL (4 branches)';
  end if;
  if position('''gps''' in v_def) = 0 then
    raise exception 'H5-E2D STOP: missing gps branch';
  end if;
  if position('''sortie_depart''' in v_def) = 0 then
    raise exception 'H5-E2D STOP: missing sortie_depart branch';
  end if;
  if position('''sortie_retour''' in v_def) = 0 then
    raise exception 'H5-E2D STOP: missing sortie_retour branch';
  end if;
  if position('''horodateur''' in v_def) = 0 then
    raise exception 'H5-E2D STOP: missing horodateur branch';
  end if;
  if position('c.auth_user_id' in v_def) = 0 then
    raise exception 'H5-E2D STOP: missing c.auth_user_id';
  end if;
  if position('he.employee_id' in v_def) = 0 then
    raise exception 'H5-E2D STOP: missing he.employee_id';
  end if;
  if position('c.id = he.employee_id' in v_def) = 0
     and position('c.id=he.employee_id' in v_def) = 0 then
    raise exception 'H5-E2D STOP: missing join chauffeurs.id = horodateur_events.employee_id';
  end if;
  if position('he.user_id' in v_def) > 0 then
    raise exception 'H5-E2D STOP: forbidden he.user_id reference';
  end if;
  if position('america/toronto' in v_def) = 0 then
    raise exception 'H5-E2D STOP: missing America/Toronto timezone contract';
  end if;
end
$$;

revoke all privileges on table public.direction_terrain_positions from public;
revoke all privileges on table public.direction_terrain_positions from anon;
revoke all privileges on table public.direction_terrain_positions from authenticated;
revoke all privileges on table public.direction_terrain_positions from service_role;

grant select on table public.direction_terrain_positions to authenticated;
grant select on table public.direction_terrain_positions to service_role;

commit;
