drop policy if exists "photos_dossiers_storage_select_policy" on storage.objects;
create policy "photos_dossiers_storage_select_policy"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'photos-dossiers'
    and (
      public.has_app_permission('documents')
      or public.has_app_permission('livraisons')
      or public.has_app_permission('terrain')
    )
  );

drop policy if exists "photos_dossiers_storage_insert_policy" on storage.objects;
create policy "photos_dossiers_storage_insert_policy"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'photos-dossiers'
    and (
      public.has_app_permission('documents')
      or public.has_app_permission('livraisons')
      or public.has_app_permission('terrain')
    )
  );

drop policy if exists "photos_dossiers_storage_delete_policy" on storage.objects;
create policy "photos_dossiers_storage_delete_policy"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'photos-dossiers'
    and (
      public.has_app_permission('documents')
      or public.has_app_permission('livraisons')
      or public.has_app_permission('terrain')
    )
  );
