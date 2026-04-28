-- Archivage (hors statut) et traçage des suppressions logiques.
-- L'ancien comportement mélangeait status 'supprimee' et deleted_at; on distingue
-- désormais : supprimee = refus workflow (actif en liste), deleted_at = suppression admin.

alter table public.app_improvements
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users (id) on delete set null;

alter table public.app_improvements
  add column if not exists deleted_by uuid null references auth.users (id) on delete set null;

comment on column public.app_improvements.archived_at is
  'Si non null, la suggestion est archivée (hors liste "Actives").';
comment on column public.app_improvements.deleted_at is
  'Suppression logique admin uniquement.';

-- Rétablir la visibilité "liste active" des suggestions au statut refus workflow (sans archivage ni vraie suppression)
update public.app_improvements
set deleted_at = null,
    deleted_by = null
where status = 'supprimee'
  and deleted_at is not null
  and archived_at is null;

create index if not exists idx_app_improvements_active_list
  on public.app_improvements (created_at desc)
  where deleted_at is null and archived_at is null;

create index if not exists idx_app_improvements_archived
  on public.app_improvements (archived_at desc)
  where deleted_at is null and archived_at is not null;
