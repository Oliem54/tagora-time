create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  );
$$;

create or replace function public.current_app_permissions()
returns text[]
language sql
stable
as $$
  select coalesce(
    array(
      select jsonb_array_elements_text(
        coalesce(
          auth.jwt() -> 'app_metadata' -> 'permissions',
          auth.jwt() -> 'user_metadata' -> 'permissions',
          '[]'::jsonb
        )
      )
    ),
    array[]::text[]
  );
$$;

create or replace function public.has_app_permission(p_permission text)
returns boolean
language sql
stable
as $$
  select
    public.current_app_role() = 'direction'
    and p_permission = any(public.current_app_permissions())
    or (
      public.current_app_role() = 'employe'
      and p_permission = any(public.current_app_permissions())
    );
$$;

create or replace function public.is_direction_user()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'direction';
$$;

alter table if exists public.dossiers enable row level security;
alter table if exists public.notes_dossier enable row level security;
alter table if exists public.photos_dossier enable row level security;
alter table if exists public.sorties_terrain enable row level security;
alter table if exists public.livraisons_planifiees enable row level security;
alter table if exists public.temps_titan enable row level security;
alter table if exists public.chauffeurs enable row level security;
alter table if exists public.vehicules enable row level security;
alter table if exists public.remorques enable row level security;

drop policy if exists "dossiers_select_policy" on public.dossiers;
create policy "dossiers_select_policy"
  on public.dossiers
  for select
  to authenticated
  using (
    (
      public.is_direction_user()
      and public.has_app_permission('dossiers')
    )
    or (
      public.current_app_role() = 'employe'
      and public.has_app_permission('dossiers')
      and user_id = auth.uid()
    )
  );

drop policy if exists "dossiers_insert_policy" on public.dossiers;
create policy "dossiers_insert_policy"
  on public.dossiers
  for insert
  to authenticated
  with check (
    (
      public.is_direction_user()
      and public.has_app_permission('dossiers')
    )
    or (
      public.current_app_role() = 'employe'
      and public.has_app_permission('dossiers')
      and user_id = auth.uid()
    )
  );

drop policy if exists "dossiers_update_policy" on public.dossiers;
create policy "dossiers_update_policy"
  on public.dossiers
  for update
  to authenticated
  using (
    (
      public.is_direction_user()
      and public.has_app_permission('dossiers')
    )
    or (
      public.current_app_role() = 'employe'
      and public.has_app_permission('dossiers')
      and user_id = auth.uid()
    )
  )
  with check (
    (
      public.is_direction_user()
      and public.has_app_permission('dossiers')
    )
    or (
      public.current_app_role() = 'employe'
      and public.has_app_permission('dossiers')
      and user_id = auth.uid()
    )
  );

drop policy if exists "dossiers_delete_policy" on public.dossiers;
create policy "dossiers_delete_policy"
  on public.dossiers
  for delete
  to authenticated
  using (
    (
      public.is_direction_user()
      and public.has_app_permission('dossiers')
    )
    or (
      public.current_app_role() = 'employe'
      and public.has_app_permission('dossiers')
      and user_id = auth.uid()
    )
  );

drop policy if exists "notes_dossier_select_policy" on public.notes_dossier;
create policy "notes_dossier_select_policy"
  on public.notes_dossier
  for select
  to authenticated
  using (
    public.has_app_permission('documents')
    and exists (
      select 1
      from public.dossiers d
      where d.id = notes_dossier.dossier_id
        and (
          public.is_direction_user()
          or d.user_id = auth.uid()
        )
    )
  );

drop policy if exists "notes_dossier_insert_policy" on public.notes_dossier;
create policy "notes_dossier_insert_policy"
  on public.notes_dossier
  for insert
  to authenticated
  with check (
    public.has_app_permission('documents')
    and (
      public.is_direction_user()
      or user_id = auth.uid()
    )
    and exists (
      select 1
      from public.dossiers d
      where d.id = notes_dossier.dossier_id
        and (
          public.is_direction_user()
          or d.user_id = auth.uid()
        )
    )
  );

drop policy if exists "notes_dossier_delete_policy" on public.notes_dossier;
create policy "notes_dossier_delete_policy"
  on public.notes_dossier
  for delete
  to authenticated
  using (
    public.has_app_permission('documents')
    and (
      public.is_direction_user()
      or user_id = auth.uid()
    )
  );

drop policy if exists "photos_dossier_select_policy" on public.photos_dossier;
create policy "photos_dossier_select_policy"
  on public.photos_dossier
  for select
  to authenticated
  using (
    public.has_app_permission('documents')
    and exists (
      select 1
      from public.dossiers d
      where d.id = photos_dossier.dossier_id
        and (
          public.is_direction_user()
          or d.user_id = auth.uid()
        )
    )
  );

drop policy if exists "photos_dossier_insert_policy" on public.photos_dossier;
create policy "photos_dossier_insert_policy"
  on public.photos_dossier
  for insert
  to authenticated
  with check (
    public.has_app_permission('documents')
    and (
      public.is_direction_user()
      or user_id = auth.uid()
    )
    and exists (
      select 1
      from public.dossiers d
      where d.id = photos_dossier.dossier_id
        and (
          public.is_direction_user()
          or d.user_id = auth.uid()
        )
    )
  );

drop policy if exists "photos_dossier_delete_policy" on public.photos_dossier;
create policy "photos_dossier_delete_policy"
  on public.photos_dossier
  for delete
  to authenticated
  using (
    public.has_app_permission('documents')
    and (
      public.is_direction_user()
      or user_id = auth.uid()
    )
  );

drop policy if exists "sorties_terrain_select_policy" on public.sorties_terrain;
create policy "sorties_terrain_select_policy"
  on public.sorties_terrain
  for select
  to authenticated
  using (
    (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
    or (
      public.current_app_role() = 'employe'
      and public.has_app_permission('terrain')
      and user_id = auth.uid()
    )
  );

drop policy if exists "sorties_terrain_insert_policy" on public.sorties_terrain;
create policy "sorties_terrain_insert_policy"
  on public.sorties_terrain
  for insert
  to authenticated
  with check (
    (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
    or (
      public.current_app_role() = 'employe'
      and public.has_app_permission('terrain')
      and user_id = auth.uid()
    )
  );

drop policy if exists "sorties_terrain_update_policy" on public.sorties_terrain;
create policy "sorties_terrain_update_policy"
  on public.sorties_terrain
  for update
  to authenticated
  using (
    (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
    or (
      public.current_app_role() = 'employe'
      and public.has_app_permission('terrain')
      and user_id = auth.uid()
    )
  )
  with check (
    (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
    or (
      public.current_app_role() = 'employe'
      and public.has_app_permission('terrain')
      and user_id = auth.uid()
    )
  );

drop policy if exists "sorties_terrain_delete_policy" on public.sorties_terrain;
create policy "sorties_terrain_delete_policy"
  on public.sorties_terrain
  for delete
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  );

drop policy if exists "livraisons_planifiees_select_policy" on public.livraisons_planifiees;
create policy "livraisons_planifiees_select_policy"
  on public.livraisons_planifiees
  for select
  to authenticated
  using (
    public.has_app_permission('livraisons')
  );

drop policy if exists "livraisons_planifiees_insert_policy" on public.livraisons_planifiees;
create policy "livraisons_planifiees_insert_policy"
  on public.livraisons_planifiees
  for insert
  to authenticated
  with check (
    public.is_direction_user()
    and public.has_app_permission('livraisons')
  );

drop policy if exists "livraisons_planifiees_update_policy" on public.livraisons_planifiees;
create policy "livraisons_planifiees_update_policy"
  on public.livraisons_planifiees
  for update
  to authenticated
  using (
    public.has_app_permission('livraisons')
  )
  with check (
    public.has_app_permission('livraisons')
  );

drop policy if exists "livraisons_planifiees_delete_policy" on public.livraisons_planifiees;
create policy "livraisons_planifiees_delete_policy"
  on public.livraisons_planifiees
  for delete
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('livraisons')
  );

drop policy if exists "temps_titan_select_policy" on public.temps_titan;
create policy "temps_titan_select_policy"
  on public.temps_titan
  for select
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  );

drop policy if exists "temps_titan_insert_policy" on public.temps_titan;
create policy "temps_titan_insert_policy"
  on public.temps_titan
  for insert
  to authenticated
  with check (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  );

drop policy if exists "temps_titan_delete_policy" on public.temps_titan;
create policy "temps_titan_delete_policy"
  on public.temps_titan
  for delete
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  );

drop policy if exists "chauffeurs_select_policy" on public.chauffeurs;
create policy "chauffeurs_select_policy"
  on public.chauffeurs
  for select
  to authenticated
  using (
    public.is_direction_user()
    and (
      public.has_app_permission('ressources')
      or public.has_app_permission('livraisons')
      or public.has_app_permission('terrain')
    )
  );

drop policy if exists "vehicules_select_policy" on public.vehicules;
create policy "vehicules_select_policy"
  on public.vehicules
  for select
  to authenticated
  using (
    public.is_direction_user()
    and (
      public.has_app_permission('ressources')
      or public.has_app_permission('livraisons')
      or public.has_app_permission('terrain')
    )
  );

drop policy if exists "remorques_select_policy" on public.remorques;
create policy "remorques_select_policy"
  on public.remorques
  for select
  to authenticated
  using (
    public.is_direction_user()
    and (
      public.has_app_permission('ressources')
      or public.has_app_permission('livraisons')
    )
  );

drop policy if exists "photos_dossiers_storage_select_policy" on storage.objects;
create policy "photos_dossiers_storage_select_policy"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'photos-dossiers'
    and public.has_app_permission('documents')
  );

drop policy if exists "photos_dossiers_storage_insert_policy" on storage.objects;
create policy "photos_dossiers_storage_insert_policy"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'photos-dossiers'
    and public.has_app_permission('documents')
  );

drop policy if exists "photos_dossiers_storage_delete_policy" on storage.objects;
create policy "photos_dossiers_storage_delete_policy"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'photos-dossiers'
    and public.has_app_permission('documents')
  );
