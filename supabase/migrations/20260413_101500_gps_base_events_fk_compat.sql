do $$
declare
  gps_position_fk_name text;
  chauffeur_fk_name text;
begin
  select con.conname
  into gps_position_fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join unnest(con.conkey) with ordinality as cols(attnum, ord) on true
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = cols.attnum
  where nsp.nspname = 'public'
    and rel.relname = 'gps_base_events'
    and con.contype = 'f'
    and att.attname = 'gps_position_id'
  limit 1;

  if gps_position_fk_name is not null then
    execute format(
      'alter table public.gps_base_events drop constraint %I',
      gps_position_fk_name
    );
  end if;

  select con.conname
  into chauffeur_fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join unnest(con.conkey) with ordinality as cols(attnum, ord) on true
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = cols.attnum
  where nsp.nspname = 'public'
    and rel.relname = 'gps_base_events'
    and con.contype = 'f'
    and att.attname = 'chauffeur_id'
  limit 1;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'chauffeurs'
  ) then
    if chauffeur_fk_name is null then
      begin
        alter table public.gps_base_events
          add constraint gps_base_events_chauffeur_id_fkey
          foreign key (chauffeur_id)
          references public.chauffeurs (id)
          on delete set null;
      exception
        when duplicate_object then
          null;
      end;
    end if;
  elsif chauffeur_fk_name is not null then
    execute format(
      'alter table public.gps_base_events drop constraint %I',
      chauffeur_fk_name
    );
  end if;
end $$;
