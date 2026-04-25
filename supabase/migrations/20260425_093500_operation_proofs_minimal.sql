create table if not exists public.operation_proofs (
  id uuid primary key default gen_random_uuid(),
  module_source text not null,
  source_id text not null,
  type_preuve text not null,
  categorie text null,
  nom text not null,
  date_heure timestamptz not null default timezone('utc', now()),
  cree_par uuid null references auth.users(id) on delete set null,
  url_fichier text not null,
  mime_type text null,
  taille bigint null,
  commentaire text null,
  statut text null,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'operation_proofs_module_source_check'
      and conrelid = 'public.operation_proofs'::regclass
  ) then
    alter table public.operation_proofs
      add constraint operation_proofs_module_source_check
      check (module_source in ('dossier', 'livraison', 'ramassage', 'service_case', 'helpdesk_ticket', 'delivery_incident'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'operation_proofs_type_preuve_check'
      and conrelid = 'public.operation_proofs'::regclass
  ) then
    alter table public.operation_proofs
      add constraint operation_proofs_type_preuve_check
      check (type_preuve in ('document', 'voice', 'signature'));
  end if;
end $$;

create index if not exists idx_operation_proofs_source
  on public.operation_proofs (module_source, source_id, date_heure desc);

create index if not exists idx_operation_proofs_created_by
  on public.operation_proofs (cree_par);

alter table public.operation_proofs enable row level security;

drop policy if exists "operation_proofs_select_policy" on public.operation_proofs;
create policy "operation_proofs_select_policy"
  on public.operation_proofs
  for select
  to authenticated
  using (
    public.has_app_permission('documents')
    or public.has_app_permission('livraisons')
    or public.has_app_permission('terrain')
  );

drop policy if exists "operation_proofs_insert_policy" on public.operation_proofs;
create policy "operation_proofs_insert_policy"
  on public.operation_proofs
  for insert
  to authenticated
  with check (
    (
      public.has_app_permission('documents')
      or public.has_app_permission('livraisons')
      or public.has_app_permission('terrain')
    )
    and (
      cree_par is null
      or cree_par = auth.uid()
      or public.is_direction_user()
    )
  );

drop policy if exists "operation_proofs_delete_policy" on public.operation_proofs;
create policy "operation_proofs_delete_policy"
  on public.operation_proofs
  for delete
  to authenticated
  using (
    public.is_direction_user()
    or cree_par = auth.uid()
  );
