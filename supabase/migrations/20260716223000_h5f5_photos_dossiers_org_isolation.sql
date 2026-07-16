-- H5-F5B — photos-dossiers private bucket isolation (Option A)
-- Version: 20260716223000
--
-- Contract:
--   * Bucket id/name = photos-dossiers, public = false
--   * file_size_limit = 15 MiB (15728640) — aligned with H5-F5A runtime
--   * allowed_mime_types aligned with H5-F5A allowed extensions/MIME
--   * NO client policies on storage.objects for this bucket (Option A)
--   * Drop only historically named photos-dossiers policies if present
--   * Isolation is enforced by H5-F5A server routes + org path prefix
--
-- NEVER replay historical 20260425133500_storage_photos_dossiers_policy_alignment.sql
-- (authenticated SELECT/INSERT/DELETE via has_app_permission — too broad for V1).
--
-- No seeds, no persistent Storage objects, no H4/Auth/business changes.

begin;

-- 1) Private bucket: create or normalize. Never leave public=true.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'photos-dossiers',
  'photos-dossiers',
  false,
  15728640,
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-m4a',
    'audio/m4a'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Remove only historically named photos-dossiers policies (if any).
--    Do not create replacement client policies (Option A = server/service_role only).
drop policy if exists "photos_dossiers_storage_select_policy" on storage.objects;
drop policy if exists "photos_dossiers_storage_insert_policy" on storage.objects;
drop policy if exists "photos_dossiers_storage_delete_policy" on storage.objects;

-- Intentional: zero SELECT/INSERT/UPDATE/DELETE policies for photos-dossiers.
-- Browser must not access this bucket directly. H5-F5A routes use service_role
-- only after application-layer authz (membership + domain permission).

commit;
