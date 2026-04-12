create extension if not exists pgcrypto;

alter table if exists public.chauffeurs
  add column if not exists work_zone_type text,
  add column if not exists work_zone_latitude numeric(9, 6),
  add column if not exists work_zone_longitude numeric(9, 6),
  add column if not exists work_zone_radius_m integer default 100,
  add column if not exists schedule_start time,
  add column if not exists schedule_end time,
  add column if not exists auto_start_enabled boolean not null default false,
  add column if not exists auto_stop_enabled boolean not null default true,
  add column if not exists pause_paid boolean not null default true,
  add column if not exists pause_minutes integer not null default 15,
  add column if not exists lunch_paid boolean not null default false,
  add column if not exists lunch_minutes integer not null default 30,
  add column if not exists auto_lunch_stop_enabled boolean not null default false,
  add column if not exists auto_lunch_restart_enabled boolean not null default false,
  add column if not exists phone_number text,
  add column if not exists sms_alerts_enabled boolean not null default true;

alter table if exists public.chauffeurs
  drop constraint if exists chauffeurs_work_zone_type_check;

alter table if exists public.chauffeurs
  add constraint chauffeurs_work_zone_type_check
  check (
    work_zone_type is null
    or work_zone_type in ('bureau', 'qr_cuisine', 'terrain')
  );

alter table if exists public.horodateur_events
  add column if not exists company_context text,
  add column if not exists source_module text not null default 'horodateur',
  add column if not exists livraison_id bigint,
  add column if not exists dossier_id bigint,
  add column if not exists sortie_id bigint,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

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

alter table if exists public.sorties_terrain
  add column if not exists company_context text,
  add column if not exists billing_company_context text,
  add column if not exists terrain_sheet_completed boolean not null default false,
  add column if not exists terrain_sheet_completed_at timestamptz;

update public.sorties_terrain
set company_context = 'oliem_solutions'
where company_context is null;

alter table if exists public.sorties_terrain
  alter column company_context set not null;

alter table if exists public.sorties_terrain
  drop constraint if exists sorties_terrain_company_context_check;

alter table if exists public.sorties_terrain
  add constraint sorties_terrain_company_context_check
  check (
    company_context in ('oliem_solutions', 'titan_produits_industriels')
  );

alter table if exists public.sorties_terrain
  drop constraint if exists sorties_terrain_billing_company_context_check;

alter table if exists public.sorties_terrain
  add constraint sorties_terrain_billing_company_context_check
  check (
    billing_company_context is null
    or billing_company_context in ('oliem_solutions', 'titan_produits_industriels')
  );

alter table if exists public.livraisons_planifiees
  add column if not exists billing_company_context text,
  add column if not exists km_billable numeric(8, 2) not null default 0,
  add column if not exists hours_billable numeric(8, 2) not null default 0,
  add column if not exists intercompany_billable boolean not null default false;

alter table if exists public.livraisons_planifiees
  drop constraint if exists livraisons_planifiees_billing_company_context_check;

alter table if exists public.livraisons_planifiees
  add constraint livraisons_planifiees_billing_company_context_check
  check (
    billing_company_context is null
    or billing_company_context in ('oliem_solutions', 'titan_produits_industriels')
  );

alter table if exists public.temps_titan
  add column if not exists billing_company_context text,
  add column if not exists distance_km numeric(8, 2) not null default 0,
  add column if not exists total_facturable numeric(10, 2) not null default 0,
  add column if not exists source_type text,
  add column if not exists source_id text;

update public.temps_titan
set total_facturable = 0
where total_facturable is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'temps_titan'
      and column_name = 'total_titan'
  ) then
    execute '
      update public.temps_titan
      set total_facturable = coalesce(total_facturable, total_titan, 0)
      where total_facturable = 0
    ';
  end if;
end $$;

alter table if exists public.temps_titan
  drop constraint if exists temps_titan_billing_company_context_check;

alter table if exists public.temps_titan
  add constraint temps_titan_billing_company_context_check
  check (
    billing_company_context is null
    or billing_company_context in ('oliem_solutions', 'titan_produits_industriels')
  );

create table if not exists public.sms_alerts_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  chauffeur_id bigint null references public.chauffeurs(id) on delete set null,
  company_context text null check (
    company_context in ('oliem_solutions', 'titan_produits_industriels')
  ),
  alert_type text not null,
  message text not null,
  status text not null default 'queued' check (
    status in ('queued', 'sent', 'failed', 'acknowledged')
  ),
  related_table text null,
  related_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz null,
  acknowledged_at timestamptz null
);

create index if not exists idx_sms_alerts_log_user_date
  on public.sms_alerts_log (user_id, created_at desc);

create index if not exists idx_sms_alerts_log_status_date
  on public.sms_alerts_log (status, created_at desc);

create index if not exists idx_sms_alerts_log_related
  on public.sms_alerts_log (related_table, related_id, created_at desc);

create table if not exists public.authorization_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chauffeur_id bigint null references public.chauffeurs(id) on delete set null,
  company_context text not null check (
    company_context in ('oliem_solutions', 'titan_produits_industriels')
  ),
  request_type text not null check (
    request_type in (
      'early_start',
      'out_of_zone_punch',
      'lunch_shift_change',
      'manual_punch_override'
    )
  ),
  requested_at timestamptz not null default timezone('utc', now()),
  requested_value jsonb not null default '{}'::jsonb,
  justification text null,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'refused')
  ),
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  review_note text null
);

create index if not exists idx_authorization_requests_user_date
  on public.authorization_requests (user_id, requested_at desc);

create index if not exists idx_authorization_requests_status_date
  on public.authorization_requests (status, requested_at desc);

create index if not exists idx_authorization_requests_company_status
  on public.authorization_requests (company_context, status, requested_at desc);

create or replace view public.intercompany_billing_summary as
select
  tt.company_context,
  tt.billing_company_context,
  tt.employe_id,
  tt.employe_nom,
  sum(coalesce(tt.duree_heures, 0)) as total_hours,
  sum(coalesce(tt.distance_km, 0)) as total_km,
  sum(coalesce(tt.total_facturable, 0)) as total_billable
from public.temps_titan tt
where tt.billing_company_context is not null
  and tt.billing_company_context <> tt.company_context
group by
  tt.company_context,
  tt.billing_company_context,
  tt.employe_id,
  tt.employe_nom;

alter table if exists public.sms_alerts_log enable row level security;
alter table if exists public.authorization_requests enable row level security;

drop policy if exists "sms_alerts_log_select_policy" on public.sms_alerts_log;
create policy "sms_alerts_log_select_policy"
  on public.sms_alerts_log
  for select
  to authenticated
  using (
    (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
    or (
      public.current_app_role() = 'employe'
      and user_id = auth.uid()
    )
  );

drop policy if exists "sms_alerts_log_insert_policy" on public.sms_alerts_log;
create policy "sms_alerts_log_insert_policy"
  on public.sms_alerts_log
  for insert
  to authenticated
  with check (
    (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
    or (
      public.current_app_role() = 'employe'
      and user_id = auth.uid()
    )
  );

drop policy if exists "sms_alerts_log_update_policy" on public.sms_alerts_log;
create policy "sms_alerts_log_update_policy"
  on public.sms_alerts_log
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

drop policy if exists "authorization_requests_select_policy" on public.authorization_requests;
create policy "authorization_requests_select_policy"
  on public.authorization_requests
  for select
  to authenticated
  using (
    (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
    or (
      public.current_app_role() = 'employe'
      and user_id = auth.uid()
    )
  );

drop policy if exists "authorization_requests_insert_policy" on public.authorization_requests;
create policy "authorization_requests_insert_policy"
  on public.authorization_requests
  for insert
  to authenticated
  with check (
    (
      public.is_direction_user()
      and public.has_app_permission('terrain')
    )
    or (
      public.current_app_role() = 'employe'
      and user_id = auth.uid()
    )
  );

drop policy if exists "authorization_requests_update_policy" on public.authorization_requests;
create policy "authorization_requests_update_policy"
  on public.authorization_requests
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
