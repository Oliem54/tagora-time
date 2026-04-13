create extension if not exists pgcrypto;

create table if not exists public.gps_bases (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  adresse text not null,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  rayon_m integer not null default 100,
  company_context text not null check (
    company_context in ('oliem_solutions', 'titan_produits_industriels')
  ),
  type_base text not null check (
    type_base in ('siege', 'entrepot', 'chantier', 'client', 'autre')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (rayon_m > 0)
);

create index if not exists idx_gps_bases_company_type
  on public.gps_bases (company_context, type_base, nom);

alter table if exists public.gps_bases enable row level security;

drop policy if exists "gps_bases_select_policy" on public.gps_bases;
create policy "gps_bases_select_policy"
  on public.gps_bases
  for select
  to authenticated
  using (
    public.is_direction_user()
    and (
      public.has_app_permission('ressources')
      or public.has_app_permission('terrain')
    )
  );

drop policy if exists "gps_bases_insert_policy" on public.gps_bases;
create policy "gps_bases_insert_policy"
  on public.gps_bases
  for insert
  to authenticated
  with check (
    public.is_direction_user()
    and (
      public.has_app_permission('ressources')
      or public.has_app_permission('terrain')
    )
  );

drop policy if exists "gps_bases_update_policy" on public.gps_bases;
create policy "gps_bases_update_policy"
  on public.gps_bases
  for update
  to authenticated
  using (
    public.is_direction_user()
    and (
      public.has_app_permission('ressources')
      or public.has_app_permission('terrain')
    )
  )
  with check (
    public.is_direction_user()
    and (
      public.has_app_permission('ressources')
      or public.has_app_permission('terrain')
    )
  );

drop policy if exists "gps_bases_delete_policy" on public.gps_bases;
create policy "gps_bases_delete_policy"
  on public.gps_bases
  for delete
  to authenticated
  using (
    public.is_direction_user()
    and (
      public.has_app_permission('ressources')
      or public.has_app_permission('terrain')
    )
  );
