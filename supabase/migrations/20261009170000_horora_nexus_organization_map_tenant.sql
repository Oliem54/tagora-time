-- Local proposal only. Do not apply in this change.
-- Stores the opaque Nexus tenant id on the existing organization map.
-- Existing rows stay NULL until a later explicit backfill GO.
-- Application code must refuse a NULL or blank nexus_tenant_id.
-- Do not derive this value from a HORORA slug, tenantKey, UUID, or company code.

alter table public.horora_nexus_organization_map
  add column if not exists nexus_tenant_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'horora_nexus_organization_map_tenant_ck'
      and conrelid = 'public.horora_nexus_organization_map'::regclass
  ) then
    alter table public.horora_nexus_organization_map
      add constraint horora_nexus_organization_map_tenant_ck
      check (
        nexus_tenant_id is null
        or (
          nexus_tenant_id = btrim(nexus_tenant_id)
          and char_length(nexus_tenant_id) between 1 and 128
        )
      );
  end if;
end
$$;

comment on column public.horora_nexus_organization_map.nexus_tenant_id is
  'Opaque Nexus tenant id copied from a verified Nexus handoff. NULL until explicit backfill. Application refuses NULL or blank.';

create index if not exists horora_nexus_organization_map_nexus_tenant_idx
  on public.horora_nexus_organization_map (nexus_tenant_id)
  where nexus_tenant_id is not null;
