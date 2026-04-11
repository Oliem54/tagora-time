create extension if not exists pgcrypto;

create table if not exists public.gps_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  chauffeur_id bigint references public.chauffeurs (id) on delete set null,
  company_context text not null check (
    company_context in ('oliem_solutions', 'titan_produits_industriels')
  ),
  company_directory_context text,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  speed_kmh numeric(8, 2) not null default 0,
  gps_status text not null default 'actif' check (
    gps_status in ('actif', 'deplacement', 'arret', 'arrive', 'inactif')
  ),
  activity_label text,
  sortie_id bigint references public.sorties_terrain (id) on delete set null,
  livraison_id bigint references public.livraisons_planifiees (id) on delete set null,
  horodateur_event_id uuid references public.horodateur_events (id) on delete set null,
  intervention_label text,
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_gps_positions_recorded_at
  on public.gps_positions (recorded_at desc);

create index if not exists idx_gps_positions_user_date
  on public.gps_positions (user_id, recorded_at desc);

create index if not exists idx_gps_positions_chauffeur_date
  on public.gps_positions (chauffeur_id, recorded_at desc);

create index if not exists idx_gps_positions_company_status
  on public.gps_positions (company_context, gps_status, recorded_at desc);

create index if not exists idx_gps_positions_links
  on public.gps_positions (sortie_id, livraison_id, horodateur_event_id);

update public.horodateur_events he
set company_context = coalesce(
  he.company_context,
  c.primary_company,
  'oliem_solutions'
)
from public.chauffeurs c
where c.id::text = he.metadata ->> 'chauffeur_id'
  and (
    he.company_context is null
    or he.company_context not in ('oliem_solutions', 'titan_produits_industriels')
  );

update public.horodateur_events
set company_context = 'oliem_solutions'
where company_context is null;

alter table if exists public.horodateur_events
  alter column company_context set not null;

update public.sorties_terrain st
set company_context = coalesce(
  st.company_context,
  lp.company_context,
  c.primary_company,
  'oliem_solutions'
)
from public.chauffeurs c
left join public.livraisons_planifiees lp on lp.id = st.livraison_id
where (st.chauffeur_id = c.id or st.chauffeur_id is null)
  and (
    st.company_context is null
    or st.company_context not in ('oliem_solutions', 'titan_produits_industriels')
  );

update public.sorties_terrain
set company_context = 'oliem_solutions'
where company_context is null;

alter table if exists public.sorties_terrain
  alter column company_context set not null;

update public.temps_titan tt
set company_context = coalesce(
  tt.company_context,
  st.company_context,
  c.primary_company,
  'oliem_solutions'
)
from public.chauffeurs c
left join public.sorties_terrain st on st.chauffeur_id = c.id
where (tt.employe_id = c.id or tt.employe_id is null)
  and (
    tt.company_context is null
    or tt.company_context not in ('oliem_solutions', 'titan_produits_industriels')
  );

update public.temps_titan
set company_context = 'oliem_solutions'
where company_context is null;

alter table if exists public.temps_titan
  alter column company_context set not null;

alter table if exists public.gps_positions enable row level security;

drop policy if exists "gps_positions_select_policy" on public.gps_positions;
create policy "gps_positions_select_policy"
  on public.gps_positions
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

drop policy if exists "gps_positions_insert_policy" on public.gps_positions;
create policy "gps_positions_insert_policy"
  on public.gps_positions
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

drop policy if exists "gps_positions_update_policy" on public.gps_positions;
create policy "gps_positions_update_policy"
  on public.gps_positions
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

drop policy if exists "gps_positions_delete_policy" on public.gps_positions;
create policy "gps_positions_delete_policy"
  on public.gps_positions
  for delete
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  );
