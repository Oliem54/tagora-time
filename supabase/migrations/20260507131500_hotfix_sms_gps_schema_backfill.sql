-- Hotfix production: ensure SMS/GPS schema required by deployed API routes.
-- Non-destructive migration: create-if-missing and add-if-missing only.

begin;

create extension if not exists pgcrypto;

create table if not exists public.sms_alerts_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  chauffeur_id bigint null references public.chauffeurs(id) on delete set null,
  company_context text null,
  alert_type text not null,
  message text not null,
  status text not null default 'queued',
  related_table text null,
  related_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz null,
  acknowledged_at timestamptz null
);

alter table public.sms_alerts_log
  add column if not exists user_id uuid null references auth.users(id) on delete set null,
  add column if not exists chauffeur_id bigint null references public.chauffeurs(id) on delete set null,
  add column if not exists company_context text null,
  add column if not exists alert_type text,
  add column if not exists message text,
  add column if not exists status text,
  add column if not exists related_table text null,
  add column if not exists related_id text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists sent_at timestamptz null,
  add column if not exists acknowledged_at timestamptz null;

update public.sms_alerts_log
set
  status = coalesce(nullif(status, ''), 'queued'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, timezone('utc', now()))
where true;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sms_alerts_log'
      and column_name = 'alert_type'
      and is_nullable = 'YES'
  ) then
    alter table public.sms_alerts_log alter column alert_type set not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sms_alerts_log'
      and column_name = 'message'
      and is_nullable = 'YES'
  ) then
    alter table public.sms_alerts_log alter column message set not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sms_alerts_log'
      and column_name = 'status'
      and is_nullable = 'YES'
  ) then
    alter table public.sms_alerts_log alter column status set not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sms_alerts_log_status_check'
      and conrelid = 'public.sms_alerts_log'::regclass
  ) then
    alter table public.sms_alerts_log
      add constraint sms_alerts_log_status_check
      check (status in ('queued', 'sent', 'failed', 'acknowledged'));
  end if;
end $$;

create index if not exists idx_sms_alerts_log_user_date
  on public.sms_alerts_log (user_id, created_at desc);

create index if not exists idx_sms_alerts_log_status_date
  on public.sms_alerts_log (status, created_at desc);

create index if not exists idx_sms_alerts_log_related
  on public.sms_alerts_log (related_table, related_id, created_at desc);

create table if not exists public.gps_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  chauffeur_id bigint references public.chauffeurs (id) on delete set null,
  company_context text not null,
  company_directory_context text null,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  speed_kmh numeric(8, 2) not null default 0,
  gps_status text not null default 'actif',
  activity_label text null,
  sortie_id bigint null,
  livraison_id bigint null,
  horodateur_event_id uuid null,
  intervention_label text null,
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.gps_positions
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists chauffeur_id bigint references public.chauffeurs (id) on delete set null,
  add column if not exists company_context text,
  add column if not exists company_directory_context text null,
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists speed_kmh numeric(8, 2) not null default 0,
  add column if not exists gps_status text not null default 'actif',
  add column if not exists activity_label text null,
  add column if not exists sortie_id bigint null,
  add column if not exists livraison_id bigint null,
  add column if not exists horodateur_event_id uuid null,
  add column if not exists intervention_label text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists recorded_at timestamptz not null default timezone('utc', now()),
  add column if not exists created_at timestamptz not null default timezone('utc', now());

update public.gps_positions
set
  company_context = coalesce(company_context, 'oliem_solutions'),
  speed_kmh = coalesce(speed_kmh, 0),
  gps_status = coalesce(nullif(gps_status, ''), 'actif'),
  metadata = coalesce(metadata, '{}'::jsonb),
  recorded_at = coalesce(recorded_at, timezone('utc', now())),
  created_at = coalesce(created_at, timezone('utc', now()))
where true;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'gps_positions'
      and column_name = 'company_context'
      and is_nullable = 'YES'
  ) then
    alter table public.gps_positions alter column company_context set not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'gps_positions'
      and column_name = 'latitude'
      and is_nullable = 'YES'
  ) then
    alter table public.gps_positions alter column latitude set not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'gps_positions'
      and column_name = 'longitude'
      and is_nullable = 'YES'
  ) then
    alter table public.gps_positions alter column longitude set not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gps_positions_gps_status_check'
      and conrelid = 'public.gps_positions'::regclass
  ) then
    alter table public.gps_positions
      add constraint gps_positions_gps_status_check
      check (gps_status in ('actif', 'deplacement', 'arret', 'arrive', 'inactif'));
  end if;
end $$;

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

alter table if exists public.sms_alerts_log enable row level security;
alter table if exists public.gps_positions enable row level security;

-- RLS from JWT claims only (no SQL helper functions; safe when helpers are not deployed).
-- Semantics align with supabase/permissions_and_rls.sql (direction + terrain permission, or employé + own rows).

drop policy if exists "sms_alerts_log_select_policy" on public.sms_alerts_log;
create policy "sms_alerts_log_select_policy"
  on public.sms_alerts_log
  for select
  to authenticated
  using (
    (
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'direction'
      and 'terrain' = any(
        array(
          select jsonb_array_elements_text(
            coalesce(
              auth.jwt() -> 'app_metadata' -> 'permissions',
              auth.jwt() -> 'user_metadata' -> 'permissions',
              '[]'::jsonb
            )
          )
        )
      )
    )
    or (
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'employe'
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
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'direction'
      and 'terrain' = any(
        array(
          select jsonb_array_elements_text(
            coalesce(
              auth.jwt() -> 'app_metadata' -> 'permissions',
              auth.jwt() -> 'user_metadata' -> 'permissions',
              '[]'::jsonb
            )
          )
        )
      )
    )
    or (
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'employe'
      and user_id = auth.uid()
    )
  );

drop policy if exists "sms_alerts_log_update_policy" on public.sms_alerts_log;
create policy "sms_alerts_log_update_policy"
  on public.sms_alerts_log
  for update
  to authenticated
  using (
    nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'direction'
    and 'terrain' = any(
      array(
        select jsonb_array_elements_text(
          coalesce(
            auth.jwt() -> 'app_metadata' -> 'permissions',
            auth.jwt() -> 'user_metadata' -> 'permissions',
            '[]'::jsonb
          )
        )
      )
    )
  )
  with check (
    nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'direction'
    and 'terrain' = any(
      array(
        select jsonb_array_elements_text(
          coalesce(
            auth.jwt() -> 'app_metadata' -> 'permissions',
            auth.jwt() -> 'user_metadata' -> 'permissions',
            '[]'::jsonb
          )
        )
      )
    )
  );

drop policy if exists "gps_positions_select_policy" on public.gps_positions;
create policy "gps_positions_select_policy"
  on public.gps_positions
  for select
  to authenticated
  using (
    (
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'direction'
      and 'terrain' = any(
        array(
          select jsonb_array_elements_text(
            coalesce(
              auth.jwt() -> 'app_metadata' -> 'permissions',
              auth.jwt() -> 'user_metadata' -> 'permissions',
              '[]'::jsonb
            )
          )
        )
      )
    )
    or (
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'employe'
      and 'terrain' = any(
        array(
          select jsonb_array_elements_text(
            coalesce(
              auth.jwt() -> 'app_metadata' -> 'permissions',
              auth.jwt() -> 'user_metadata' -> 'permissions',
              '[]'::jsonb
            )
          )
        )
      )
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
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'direction'
      and 'terrain' = any(
        array(
          select jsonb_array_elements_text(
            coalesce(
              auth.jwt() -> 'app_metadata' -> 'permissions',
              auth.jwt() -> 'user_metadata' -> 'permissions',
              '[]'::jsonb
            )
          )
        )
      )
    )
    or (
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'employe'
      and 'terrain' = any(
        array(
          select jsonb_array_elements_text(
            coalesce(
              auth.jwt() -> 'app_metadata' -> 'permissions',
              auth.jwt() -> 'user_metadata' -> 'permissions',
              '[]'::jsonb
            )
          )
        )
      )
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
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'direction'
      and 'terrain' = any(
        array(
          select jsonb_array_elements_text(
            coalesce(
              auth.jwt() -> 'app_metadata' -> 'permissions',
              auth.jwt() -> 'user_metadata' -> 'permissions',
              '[]'::jsonb
            )
          )
        )
      )
    )
    or (
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'employe'
      and 'terrain' = any(
        array(
          select jsonb_array_elements_text(
            coalesce(
              auth.jwt() -> 'app_metadata' -> 'permissions',
              auth.jwt() -> 'user_metadata' -> 'permissions',
              '[]'::jsonb
            )
          )
        )
      )
      and user_id = auth.uid()
    )
  )
  with check (
    (
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'direction'
      and 'terrain' = any(
        array(
          select jsonb_array_elements_text(
            coalesce(
              auth.jwt() -> 'app_metadata' -> 'permissions',
              auth.jwt() -> 'user_metadata' -> 'permissions',
              '[]'::jsonb
            )
          )
        )
      )
    )
    or (
      nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'employe'
      and 'terrain' = any(
        array(
          select jsonb_array_elements_text(
            coalesce(
              auth.jwt() -> 'app_metadata' -> 'permissions',
              auth.jwt() -> 'user_metadata' -> 'permissions',
              '[]'::jsonb
            )
          )
        )
      )
      and user_id = auth.uid()
    )
  );

drop policy if exists "gps_positions_delete_policy" on public.gps_positions;
create policy "gps_positions_delete_policy"
  on public.gps_positions
  for delete
  to authenticated
  using (
    nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '')), '') = 'direction'
    and 'terrain' = any(
      array(
        select jsonb_array_elements_text(
          coalesce(
            auth.jwt() -> 'app_metadata' -> 'permissions',
            auth.jwt() -> 'user_metadata' -> 'permissions',
            '[]'::jsonb
          )
        )
      )
    )
  );

commit;
