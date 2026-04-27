alter table if exists public.photos_dossier
  add column if not exists proof_type text,
  add column if not exists proof_name text,
  add column if not exists linked_record_type text,
  add column if not exists linked_record_id bigint;

create index if not exists idx_photos_dossier_proof_type
  on public.photos_dossier (proof_type);

create index if not exists idx_photos_dossier_linked_record
  on public.photos_dossier (linked_record_type, linked_record_id);
