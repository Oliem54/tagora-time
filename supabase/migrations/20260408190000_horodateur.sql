create extension if not exists pgcrypto;

create table if not exists public.horodateur_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (
    event_type in (
      'quart_debut',
      'pause_debut',
      'pause_fin',
      'sortie_depart',
      'sortie_retour',
      'quart_fin',
      'anomalie'
    )
  ),
  occurred_at timestamptz not null default timezone('utc', now()),
  source_module text not null default 'horodateur',
  livraison_id bigint,
  dossier_id bigint,
  sortie_id bigint,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_horodateur_events_user_date
  on public.horodateur_events (user_id, occurred_at desc);

create index if not exists idx_horodateur_events_type
  on public.horodateur_events (event_type, occurred_at desc);

alter table if exists public.horodateur_events enable row level security;

drop policy if exists "horodateur_events_select_policy" on public.horodateur_events;
create policy "horodateur_events_select_policy"
  on public.horodateur_events
  for select
  to authenticated
  using (
    (
      public.current_app_role() = 'employe'
      and user_id = auth.uid()
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

drop policy if exists "horodateur_events_insert_policy" on public.horodateur_events;
create policy "horodateur_events_insert_policy"
  on public.horodateur_events
  for insert
  to authenticated
  with check (
    (
      public.current_app_role() = 'employe'
      and user_id = auth.uid()
    )
    or (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
  );

drop policy if exists "horodateur_events_update_policy" on public.horodateur_events;
create policy "horodateur_events_update_policy"
  on public.horodateur_events
  for update
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  )
  with check (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  );

drop policy if exists "horodateur_events_delete_policy" on public.horodateur_events;
create policy "horodateur_events_delete_policy"
  on public.horodateur_events
  for delete
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  );
