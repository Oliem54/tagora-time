-- Local proposal only. Do not apply without a separate Martin GO.
-- Durable HORORA consent acknowledgements may record environment production.
-- This does not create a Nexus token, role, access, or grant.

begin;

alter table public.horora_nexus_role_acknowledgements
  drop constraint if exists horora_nexus_role_ack_environment_ck;

alter table public.horora_nexus_role_acknowledgements
  add constraint horora_nexus_role_ack_environment_ck
  check (environment in ('local', 'test', 'staging', 'production'));

commit;
