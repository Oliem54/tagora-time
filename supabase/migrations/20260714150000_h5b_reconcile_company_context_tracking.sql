-- ============================================================
-- H5-B forward-only reconciliation (company context + tracking)
-- Canonical historical sources (DO NOT re-run / DO NOT mark applied):
--   20260410130000_gps_direction_and_company_hardening.sql     (R2)
--   20260412103000_timeclock_terrain_intercompany.sql          (R2)
--   20260411101500_delivery_tracking_tokens.sql                (R4)
--   20260421113000_delivery_phase_a_minimal.sql                (R2)
--
-- Scope: company_context / billing / tracking / Phase A gaps / billing views.
-- Deterministic backfills only (no blanket oliem_solutions).
-- Old deliveries: tracking_enabled = false unless already true.
-- New deliveries: column default true (app contract).
-- Tokens: gen_random_bytes / no logging of values.
-- Forbidden: table drops, column drops, view drops, CASCADE, TRUNCATE, seed, SMS.
-- Out of scope: subsequent H5 lots after B, H4 SaaS, Direction terrain view object,
--   Horodateur user_id removal.
-- Rollback: migration repair --status reverted (DDL not auto-removed).
-- ============================================================

create extension if not exists pgcrypto;

-- --- 20260410130000 gps_positions (table only; Direction terrain view deferred) ---
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

-- --- 20260412103000 chauffeurs work-zone / auto punch columns ---
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

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'chauffeurs'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'chauffeurs_work_zone_type_check'
      and conrelid = 'public.chauffeurs'::regclass
  ) then
    alter table public.chauffeurs
      add constraint chauffeurs_work_zone_type_check
      check (
        work_zone_type is null
        or work_zone_type in ('bureau', 'qr_cuisine', 'terrain')
      );
  end if;
end $$;

-- --- horodateur_events context (preserve user_id) ---
alter table if exists public.horodateur_events
  add column if not exists company_context text,
  add column if not exists source_module text not null default 'horodateur',
  add column if not exists livraison_id bigint,
  add column if not exists dossier_id bigint,
  add column if not exists sortie_id bigint,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.horodateur_events he
set company_context = c.primary_company
from public.chauffeurs c
where he.company_context is null
  and c.id::text = he.metadata ->> 'chauffeur_id'
  and c.primary_company in ('oliem_solutions', 'titan_produits_industriels');

update public.horodateur_events he
set company_context = c.primary_company
from public.chauffeurs c
where he.company_context is null
  and he.employee_id is not null
  and c.id = he.employee_id
  and c.primary_company in ('oliem_solutions', 'titan_produits_industriels');

do $$
declare
  unresolved bigint;
begin
  select count(*) into unresolved
  from public.horodateur_events
  where company_context is null
     or company_context not in ('oliem_solutions', 'titan_produits_industriels');
  if unresolved > 0 then
    raise exception
      'H5-B STOP: horodateur_events company_context unresolved=% (deterministic backfill failed)',
      unresolved;
  end if;
end $$;

alter table if exists public.horodateur_events
  alter column company_context set not null;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'horodateur_events'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'horodateur_events_company_context_check'
      and conrelid = 'public.horodateur_events'::regclass
  ) then
    alter table public.horodateur_events
      add constraint horodateur_events_company_context_check
      check (
        company_context in ('oliem_solutions', 'titan_produits_industriels')
      );
  end if;
end $$;

-- --- sorties_terrain company / billing / sheet ---
alter table if exists public.sorties_terrain
  add column if not exists company_context text,
  add column if not exists billing_company_context text,
  add column if not exists terrain_sheet_completed boolean not null default false,
  add column if not exists terrain_sheet_completed_at timestamptz;

-- Conflict gate: livraison vs chauffeur disagree when row still unresolved
do $$
declare
  conflicts bigint;
begin
  select count(*) into conflicts
  from public.sorties_terrain st
  left join public.livraisons_planifiees lp
    on lp.id = st.livraison_id
   and lp.company_context in ('oliem_solutions', 'titan_produits_industriels')
  left join public.chauffeurs c
    on c.id = st.chauffeur_id
   and c.primary_company in ('oliem_solutions', 'titan_produits_industriels')
  where (st.company_context is null
         or st.company_context not in ('oliem_solutions', 'titan_produits_industriels'))
    and lp.company_context is not null
    and c.primary_company is not null
    and lp.company_context <> c.primary_company;
  if conflicts > 0 then
    raise exception
      'H5-B STOP: sorties_terrain company_context conflicts=%',
      conflicts;
  end if;
end $$;

update public.sorties_terrain st
set company_context = case
  when st.company_context in ('oliem_solutions', 'titan_produits_industriels')
    then st.company_context
  else coalesce(
    (
      select lp.company_context
      from public.livraisons_planifiees lp
      where lp.id = st.livraison_id
        and lp.company_context in ('oliem_solutions', 'titan_produits_industriels')
    ),
    (
      select c.primary_company
      from public.chauffeurs c
      where c.id = st.chauffeur_id
        and c.primary_company in ('oliem_solutions', 'titan_produits_industriels')
    )
  )
end
where st.company_context is null
   or st.company_context not in ('oliem_solutions', 'titan_produits_industriels');

do $$
declare
  unresolved bigint;
begin
  select count(*) into unresolved
  from public.sorties_terrain
  where company_context is null
     or company_context not in ('oliem_solutions', 'titan_produits_industriels');
  if unresolved > 0 then
    raise exception
      'H5-B STOP: sorties_terrain company_context unresolved=% (no blanket fallback)',
      unresolved;
  end if;
end $$;

alter table if exists public.sorties_terrain
  alter column company_context set not null;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sorties_terrain'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'sorties_terrain_company_context_check'
      and conrelid = 'public.sorties_terrain'::regclass
  ) then
    alter table public.sorties_terrain
      add constraint sorties_terrain_company_context_check
      check (
        company_context in ('oliem_solutions', 'titan_produits_industriels')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sorties_terrain_billing_company_context_check'
      and conrelid = 'public.sorties_terrain'::regclass
  ) then
    alter table public.sorties_terrain
      add constraint sorties_terrain_billing_company_context_check
      check (
        billing_company_context is null
        or billing_company_context in ('oliem_solutions', 'titan_produits_industriels')
      );
  end if;
end $$;

-- --- livraisons billing + tracking ---
alter table if exists public.livraisons_planifiees
  add column if not exists company_context text,
  add column if not exists billing_company_context text,
  add column if not exists km_billable numeric(8, 2) not null default 0,
  add column if not exists hours_billable numeric(8, 2) not null default 0,
  add column if not exists intercompany_billable boolean not null default false,
  add column if not exists tracking_token text,
  add column if not exists tracking_enabled boolean,
  add column if not exists client_phone text,
  add column if not exists tracking_sms_sent_at timestamptz,
  add column if not exists type_operation text;

-- company_context on livraisons: existing valid wins; else chauffeur primary_company only
update public.livraisons_planifiees lp
set company_context = c.primary_company
from public.chauffeurs c
where lp.chauffeur_id = c.id
  and (lp.company_context is null
       or lp.company_context not in ('oliem_solutions', 'titan_produits_industriels'))
  and c.primary_company in ('oliem_solutions', 'titan_produits_industriels');

do $$
declare
  unresolved bigint;
begin
  select count(*) into unresolved
  from public.livraisons_planifiees
  where company_context is null
     or company_context not in ('oliem_solutions', 'titan_produits_industriels');
  if unresolved > 0 then
    raise exception
      'H5-B STOP: livraisons_planifiees company_context unresolved=%',
      unresolved;
  end if;
end $$;

alter table if exists public.livraisons_planifiees
  alter column company_context set not null;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'livraisons_planifiees'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'livraisons_planifiees_billing_company_context_check'
      and conrelid = 'public.livraisons_planifiees'::regclass
  ) then
    alter table public.livraisons_planifiees
      add constraint livraisons_planifiees_billing_company_context_check
      check (
        billing_company_context is null
        or billing_company_context in ('oliem_solutions', 'titan_produits_industriels')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'livraisons_planifiees_company_context_check'
      and conrelid = 'public.livraisons_planifiees'::regclass
  ) then
    alter table public.livraisons_planifiees
      add constraint livraisons_planifiees_company_context_check
      check (
        company_context in ('oliem_solutions', 'titan_produits_industriels')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'livraisons_planifiees_type_operation_check'
      and conrelid = 'public.livraisons_planifiees'::regclass
  ) then
    alter table public.livraisons_planifiees
      add constraint livraisons_planifiees_type_operation_check
      check (
        type_operation is null
        or type_operation in ('livraison_client', 'ramassage_client')
      );
  end if;
end $$;

-- tracking_enabled: preserve proven true; else false for legacy rows; default true for new
update public.livraisons_planifiees
set tracking_enabled = false
where tracking_enabled is null;

alter table if exists public.livraisons_planifiees
  alter column tracking_enabled set default true;

alter table if exists public.livraisons_planifiees
  alter column tracking_enabled set not null;

-- Cryptographic tokens for rows still missing a token (never raise/log values)
do $$
declare
  r record;
  candidate text;
  attempts int;
begin
  for r in
    select id
    from public.livraisons_planifiees
    where tracking_token is null
       or btrim(tracking_token) = ''
  loop
    attempts := 0;
    loop
      attempts := attempts + 1;
      candidate := encode(gen_random_bytes(16), 'hex');
      exit when not exists (
        select 1
        from public.livraisons_planifiees x
        where x.tracking_token = candidate
      );
      if attempts > 20 then
        raise exception 'H5-B STOP: unable to allocate unique tracking_token';
      end if;
    end loop;
    update public.livraisons_planifiees
    set tracking_token = candidate
    where id = r.id;
  end loop;
end $$;

do $$
declare
  dups bigint;
  short_tokens bigint;
begin
  select count(*) into dups
  from (
    select tracking_token
    from public.livraisons_planifiees
    where tracking_token is not null
    group by tracking_token
    having count(*) > 1
  ) t;
  if dups > 0 then
    raise exception 'H5-B STOP: tracking_token duplicates=%', dups;
  end if;

  select count(*) into short_tokens
  from public.livraisons_planifiees
  where tracking_token is not null
    and length(tracking_token) < 24;
  if short_tokens > 0 then
    raise exception 'H5-B STOP: tracking_token too short on % rows', short_tokens;
  end if;
end $$;

create unique index if not exists idx_livraisons_planifiees_tracking_token
  on public.livraisons_planifiees (tracking_token)
  where tracking_token is not null;

-- --- temps_titan company / billing / distance ---
alter table if exists public.temps_titan
  add column if not exists company_context text,
  add column if not exists billing_company_context text,
  add column if not exists distance_km numeric(8, 2) not null default 0,
  add column if not exists total_facturable numeric(10, 2) not null default 0,
  add column if not exists source_type text,
  add column if not exists source_id text;

update public.temps_titan tt
set company_context = c.primary_company
from public.chauffeurs c
where tt.employe_id = c.id
  and (tt.company_context is null
       or tt.company_context not in ('oliem_solutions', 'titan_produits_industriels'))
  and c.primary_company in ('oliem_solutions', 'titan_produits_industriels');

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'temps_titan'
      and column_name = 'total_titan'
  ) then
    execute '
      update public.temps_titan
      set total_facturable = coalesce(nullif(total_facturable, 0), total_titan, 0)
      where coalesce(total_facturable, 0) = 0
    ';
  end if;
end $$;

do $$
declare
  unresolved bigint;
begin
  select count(*) into unresolved
  from public.temps_titan
  where company_context is null
     or company_context not in ('oliem_solutions', 'titan_produits_industriels');
  if unresolved > 0 then
    raise exception
      'H5-B STOP: temps_titan company_context unresolved=%',
      unresolved;
  end if;
end $$;

alter table if exists public.temps_titan
  alter column company_context set not null;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'temps_titan'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'temps_titan_company_context_check'
      and conrelid = 'public.temps_titan'::regclass
  ) then
    alter table public.temps_titan
      add constraint temps_titan_company_context_check
      check (
        company_context in ('oliem_solutions', 'titan_produits_industriels')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'temps_titan_billing_company_context_check'
      and conrelid = 'public.temps_titan'::regclass
  ) then
    alter table public.temps_titan
      add constraint temps_titan_billing_company_context_check
      check (
        billing_company_context is null
        or billing_company_context in ('oliem_solutions', 'titan_produits_industriels')
      );
  end if;
end $$;

-- --- sms_alerts_log + authorization_requests ---
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

-- --- Phase A tables (IF NOT EXISTS + constraints / FKs after orphan checks) ---
create table if not exists public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  livraison_id bigint null,
  proof_type text not null,
  proof_data jsonb not null default '{}'::jsonb,
  captured_by uuid null references auth.users(id) on delete set null,
  captured_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.delivery_media (
  id uuid primary key default gen_random_uuid(),
  livraison_id bigint null,
  proof_id uuid null,
  media_type text not null,
  storage_bucket text not null,
  storage_path text not null,
  public_url text null,
  uploaded_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.delivery_incidents (
  id uuid primary key default gen_random_uuid(),
  livraison_id bigint null,
  incident_category text not null,
  severity text not null default 'medium',
  description text null,
  requires_sav boolean not null default false,
  status text not null default 'open',
  detected_by uuid null references auth.users(id) on delete set null,
  detected_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.service_cases (
  id uuid primary key default gen_random_uuid(),
  livraison_id bigint null,
  incident_id uuid not null,
  status text not null default 'draft',
  summary text null,
  created_by uuid null references auth.users(id) on delete set null,
  odoo_ticket_id text null,
  odoo_sync_status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.delivery_proofs
  add column if not exists livraison_id bigint,
  add column if not exists proof_type text,
  add column if not exists proof_data jsonb not null default '{}'::jsonb,
  add column if not exists captured_by uuid,
  add column if not exists captured_at timestamptz not null default timezone('utc', now()),
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.delivery_media
  add column if not exists livraison_id bigint,
  add column if not exists proof_id uuid,
  add column if not exists media_type text,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists public_url text,
  add column if not exists uploaded_by uuid,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.delivery_incidents
  add column if not exists livraison_id bigint,
  add column if not exists incident_category text,
  add column if not exists severity text not null default 'medium',
  add column if not exists description text,
  add column if not exists requires_sav boolean not null default false,
  add column if not exists status text not null default 'open',
  add column if not exists detected_by uuid,
  add column if not exists detected_at timestamptz not null default timezone('utc', now()),
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table if exists public.service_cases
  add column if not exists livraison_id bigint,
  add column if not exists incident_id uuid,
  add column if not exists status text not null default 'draft',
  add column if not exists summary text,
  add column if not exists created_by uuid,
  add column if not exists odoo_ticket_id text,
  add column if not exists odoo_sync_status text not null default 'pending',
  add column if not exists created_at timestamptz not null default timezone('utc', now());

do $$
declare
  orphans bigint;
begin
  select count(*) into orphans
  from public.delivery_proofs dp
  where dp.livraison_id is not null
    and not exists (
      select 1 from public.livraisons_planifiees lp where lp.id = dp.livraison_id
    );
  if orphans > 0 then
    raise exception 'H5-B STOP: delivery_proofs orphan livraison_id count=%', orphans;
  end if;

  select count(*) into orphans
  from public.delivery_media dm
  where dm.livraison_id is not null
    and not exists (
      select 1 from public.livraisons_planifiees lp where lp.id = dm.livraison_id
    );
  if orphans > 0 then
    raise exception 'H5-B STOP: delivery_media orphan livraison_id count=%', orphans;
  end if;

  select count(*) into orphans
  from public.delivery_media dm
  where dm.proof_id is not null
    and not exists (
      select 1 from public.delivery_proofs p where p.id = dm.proof_id
    );
  if orphans > 0 then
    raise exception 'H5-B STOP: delivery_media orphan proof_id count=%', orphans;
  end if;

  select count(*) into orphans
  from public.delivery_incidents di
  where di.livraison_id is not null
    and not exists (
      select 1 from public.livraisons_planifiees lp where lp.id = di.livraison_id
    );
  if orphans > 0 then
    raise exception 'H5-B STOP: delivery_incidents orphan livraison_id count=%', orphans;
  end if;

  select count(*) into orphans
  from public.service_cases sc
  where sc.livraison_id is not null
    and not exists (
      select 1 from public.livraisons_planifiees lp where lp.id = sc.livraison_id
    );
  if orphans > 0 then
    raise exception 'H5-B STOP: service_cases orphan livraison_id count=%', orphans;
  end if;

  select count(*) into orphans
  from public.service_cases sc
  where sc.incident_id is not null
    and not exists (
      select 1 from public.delivery_incidents di where di.id = sc.incident_id
    );
  if orphans > 0 then
    raise exception 'H5-B STOP: service_cases orphan incident_id count=%', orphans;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_proofs_proof_type_check'
      and conrelid = 'public.delivery_proofs'::regclass
  ) then
    alter table public.delivery_proofs
      add constraint delivery_proofs_proof_type_check
      check (proof_type in ('signature', 'voice_declaration', 'handover_note', 'pickup_note'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_media_media_type_check'
      and conrelid = 'public.delivery_media'::regclass
  ) then
    alter table public.delivery_media
      add constraint delivery_media_media_type_check
      check (media_type in ('photo', 'audio'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_incidents_incident_category_check'
      and conrelid = 'public.delivery_incidents'::regclass
  ) then
    alter table public.delivery_incidents
      add constraint delivery_incidents_incident_category_check
      check (
        incident_category in (
          'dommage',
          'piece_manquante',
          'produit_refuse',
          'erreur_modele',
          'bris_apparent',
          'client_insatisfait',
          'accessoire_absent',
          'soupcon_technique',
          'autre'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_incidents_severity_check'
      and conrelid = 'public.delivery_incidents'::regclass
  ) then
    alter table public.delivery_incidents
      add constraint delivery_incidents_severity_check
      check (severity in ('low', 'medium', 'high', 'critical'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_incidents_status_check'
      and conrelid = 'public.delivery_incidents'::regclass
  ) then
    alter table public.delivery_incidents
      add constraint delivery_incidents_status_check
      check (status in ('open', 'under_review', 'closed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_cases_status_check'
      and conrelid = 'public.service_cases'::regclass
  ) then
    alter table public.service_cases
      add constraint service_cases_status_check
      check (status in ('draft', 'queued', 'sent_to_odoo', 'failed', 'closed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_cases_odoo_sync_status_check'
      and conrelid = 'public.service_cases'::regclass
  ) then
    alter table public.service_cases
      add constraint service_cases_odoo_sync_status_check
      check (odoo_sync_status in ('pending', 'queued', 'sent', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_proofs_livraison_id_fkey'
      and conrelid = 'public.delivery_proofs'::regclass
  ) then
    alter table public.delivery_proofs
      add constraint delivery_proofs_livraison_id_fkey
      foreign key (livraison_id)
      references public.livraisons_planifiees(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_media_livraison_id_fkey'
      and conrelid = 'public.delivery_media'::regclass
  ) then
    alter table public.delivery_media
      add constraint delivery_media_livraison_id_fkey
      foreign key (livraison_id)
      references public.livraisons_planifiees(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_media_proof_id_fkey'
      and conrelid = 'public.delivery_media'::regclass
  ) then
    alter table public.delivery_media
      add constraint delivery_media_proof_id_fkey
      foreign key (proof_id)
      references public.delivery_proofs(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_incidents_livraison_id_fkey'
      and conrelid = 'public.delivery_incidents'::regclass
  ) then
    alter table public.delivery_incidents
      add constraint delivery_incidents_livraison_id_fkey
      foreign key (livraison_id)
      references public.livraisons_planifiees(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_cases_livraison_id_fkey'
      and conrelid = 'public.service_cases'::regclass
  ) then
    alter table public.service_cases
      add constraint service_cases_livraison_id_fkey
      foreign key (livraison_id)
      references public.livraisons_planifiees(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_cases_incident_id_fkey'
      and conrelid = 'public.service_cases'::regclass
  ) then
    alter table public.service_cases
      add constraint service_cases_incident_id_fkey
      foreign key (incident_id)
      references public.delivery_incidents(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'service_cases_incident_id_key'
      and conrelid = 'public.service_cases'::regclass
  ) then
    alter table public.service_cases
      add constraint service_cases_incident_id_key unique (incident_id);
  end if;
end $$;

create index if not exists idx_delivery_proofs_livraison_captured_at
  on public.delivery_proofs (livraison_id, captured_at desc);
create index if not exists idx_delivery_proofs_type
  on public.delivery_proofs (proof_type);

create index if not exists idx_delivery_media_livraison_created_at
  on public.delivery_media (livraison_id, created_at desc);
create index if not exists idx_delivery_media_proof_id
  on public.delivery_media (proof_id);
create index if not exists idx_delivery_media_type
  on public.delivery_media (media_type);

create index if not exists idx_delivery_incidents_livraison_created_at
  on public.delivery_incidents (livraison_id, created_at desc);
create index if not exists idx_delivery_incidents_status_severity
  on public.delivery_incidents (status, severity);

create index if not exists idx_service_cases_livraison_created_at
  on public.service_cases (livraison_id, created_at desc);
create index if not exists idx_service_cases_status
  on public.service_cases (status);
create index if not exists idx_service_cases_odoo_sync_status
  on public.service_cases (odoo_sync_status);

-- RLS on Phase A without permissive policies (deny-by-default for roles without grants)
alter table if exists public.delivery_proofs enable row level security;
alter table if exists public.delivery_media enable row level security;
alter table if exists public.delivery_incidents enable row level security;
alter table if exists public.service_cases enable row level security;

-- --- Billing views (columns now guaranteed) ---
create or replace view public.intercompany_billing_summary as
select
  tt.company_context,
  tt.billing_company_context,
  tt.employe_id,
  tt.employe_nom,
  sum(
    case
      when coalesce(tt.facturable_minutes, 0) > 0 then tt.facturable_minutes::numeric / 60.0
      else coalesce(tt.duree_heures, 0)
    end
  ) as total_hours,
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

create or replace view public.payroll_company_summary as
select
  tt.company_context,
  tt.employe_id,
  tt.employe_nom,
  min(tt.date_travail) as first_work_date,
  max(tt.date_travail) as last_work_date,
  sum(
    case
      when coalesce(tt.payable_minutes, 0) > 0 then tt.payable_minutes::numeric / 60.0
      else coalesce(tt.duree_heures, 0)
    end
  ) as total_hours,
  sum(coalesce(tt.total_salaire, 0)) as total_salary,
  sum(coalesce(tt.total_benefice, 0)) as total_margin,
  sum(coalesce(tt.total_titan, 0)) as total_billable
from public.temps_titan tt
group by tt.company_context, tt.employe_id, tt.employe_nom;

-- Final integrity: no SMS side effects; tracking_sms_sent_at untouched by this migration.
-- type_operation intentionally left nullable for historical rows without certainty.
