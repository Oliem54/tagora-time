create extension if not exists pgcrypto;

create table if not exists public.horodateur_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  company_context text null,
  source_module text not null default 'horodateur',
  livraison_id bigint null,
  dossier_id bigint null,
  sortie_id bigint null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  entered_by_admin boolean not null default false,
  entered_by_user_id uuid null references auth.users (id) on delete set null,
  admin_note text null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.horodateur_events
  add column if not exists company_context text,
  add column if not exists source_module text not null default 'horodateur',
  add column if not exists livraison_id bigint,
  add column if not exists dossier_id bigint,
  add column if not exists sortie_id bigint,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists entered_by_admin boolean not null default false,
  add column if not exists entered_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists admin_note text,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

update public.horodateur_events
set company_context = 'oliem_solutions'
where company_context is null;

alter table if exists public.horodateur_events
  alter column company_context set not null;

alter table if exists public.horodateur_events
  drop constraint if exists horodateur_events_event_type_check;

alter table if exists public.horodateur_events
  add constraint horodateur_events_event_type_check
  check (
    event_type in (
      'quart_debut',
      'quart_fin',
      'pause_debut',
      'pause_fin',
      'dinner_debut',
      'dinner_fin',
      'sortie_depart',
      'sortie_retour',
      'terrain_start',
      'terrain_end',
      'zone_entry',
      'zone_exit',
      'auto_stop',
      'auto_restart',
      'authorization_requested',
      'authorization_approved',
      'authorization_refused',
      'anomalie'
    )
  );

alter table if exists public.horodateur_events
  drop constraint if exists horodateur_events_company_context_check;

alter table if exists public.horodateur_events
  add constraint horodateur_events_company_context_check
  check (
    company_context in ('oliem_solutions', 'titan_produits_industriels')
  );

create index if not exists idx_horodateur_events_user_date
  on public.horodateur_events (user_id, occurred_at desc);

create index if not exists idx_horodateur_events_type
  on public.horodateur_events (event_type, occurred_at desc);

create index if not exists idx_horodateur_events_company_context
  on public.horodateur_events (company_context, occurred_at desc);

create index if not exists idx_horodateur_events_admin_date
  on public.horodateur_events (entered_by_admin, occurred_at desc);

create index if not exists idx_horodateur_events_entered_by_user
  on public.horodateur_events (entered_by_user_id, created_at desc);

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
      and entered_by_admin = false
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
