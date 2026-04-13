create extension if not exists pgcrypto;

create table if not exists public.gps_base_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users (id) on delete set null,
  chauffeur_id bigint null,
  company_context text not null check (
    company_context in ('oliem_solutions', 'titan_produits_industriels')
  ),
  gps_position_id uuid not null,
  base_id uuid not null references public.gps_bases (id) on delete cascade,
  event_type text not null check (
    event_type in (
      'gps_base_entered',
      'gps_base_exited',
      'gps_base_arrived',
      'gps_base_returned'
    )
  ),
  event_label text not null,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  distance_m integer,
  rayon_metres integer,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'chauffeurs'
  ) then
    begin
      alter table public.gps_base_events
        add constraint gps_base_events_chauffeur_id_fkey
        foreign key (chauffeur_id)
        references public.chauffeurs (id)
        on delete set null;
    exception
      when duplicate_object then
        null;
    end;
  end if;
end $$;

create unique index if not exists idx_gps_base_events_position_event_unique
  on public.gps_base_events (gps_position_id, event_type, base_id);

create index if not exists idx_gps_base_events_user_date
  on public.gps_base_events (user_id, occurred_at desc);

create index if not exists idx_gps_base_events_chauffeur_date
  on public.gps_base_events (chauffeur_id, occurred_at desc);

create index if not exists idx_gps_base_events_company_type_date
  on public.gps_base_events (company_context, event_type, occurred_at desc);

create index if not exists idx_gps_base_events_base_date
  on public.gps_base_events (base_id, occurred_at desc);

create index if not exists idx_gps_base_events_user_base_type_date
  on public.gps_base_events (user_id, base_id, event_type, occurred_at desc);

alter table if exists public.gps_base_events enable row level security;

drop policy if exists "gps_base_events_select_policy" on public.gps_base_events;
create policy "gps_base_events_select_policy"
  on public.gps_base_events
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

drop policy if exists "gps_base_events_insert_policy" on public.gps_base_events;
create policy "gps_base_events_insert_policy"
  on public.gps_base_events
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

drop policy if exists "gps_base_events_update_policy" on public.gps_base_events;
create policy "gps_base_events_update_policy"
  on public.gps_base_events
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

drop policy if exists "gps_base_events_delete_policy" on public.gps_base_events;
create policy "gps_base_events_delete_policy"
  on public.gps_base_events
  for delete
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('terrain')
  );
