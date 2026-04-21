create extension if not exists pgcrypto;

alter table if exists public.livraisons_planifiees
  add column if not exists type_operation text;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'livraisons_planifiees'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'livraisons_planifiees_type_operation_check'
      and con.conrelid = 'public.livraisons_planifiees'::regclass
  ) then
    alter table public.livraisons_planifiees
      add constraint livraisons_planifiees_type_operation_check
      check (
        type_operation is null
        or type_operation in ('livraison_client', 'ramassage_client')
      );
  end if;
end $$;

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
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'delivery_proofs'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'delivery_proofs_proof_type_check'
      and con.conrelid = 'public.delivery_proofs'::regclass
  ) then
    alter table public.delivery_proofs
      add constraint delivery_proofs_proof_type_check
      check (proof_type in ('signature', 'voice_declaration', 'handover_note', 'pickup_note'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'delivery_media'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'delivery_media_media_type_check'
      and con.conrelid = 'public.delivery_media'::regclass
  ) then
    alter table public.delivery_media
      add constraint delivery_media_media_type_check
      check (media_type in ('photo', 'audio'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'delivery_incidents'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'delivery_incidents_incident_category_check'
      and con.conrelid = 'public.delivery_incidents'::regclass
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
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'delivery_incidents'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'delivery_incidents_severity_check'
      and con.conrelid = 'public.delivery_incidents'::regclass
  ) then
    alter table public.delivery_incidents
      add constraint delivery_incidents_severity_check
      check (severity in ('low', 'medium', 'high', 'critical'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'delivery_incidents'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'delivery_incidents_status_check'
      and con.conrelid = 'public.delivery_incidents'::regclass
  ) then
    alter table public.delivery_incidents
      add constraint delivery_incidents_status_check
      check (status in ('open', 'under_review', 'closed'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'service_cases'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'service_cases_status_check'
      and con.conrelid = 'public.service_cases'::regclass
  ) then
    alter table public.service_cases
      add constraint service_cases_status_check
      check (status in ('draft', 'queued', 'sent_to_odoo', 'failed', 'closed'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'service_cases'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'service_cases_odoo_sync_status_check'
      and con.conrelid = 'public.service_cases'::regclass
  ) then
    alter table public.service_cases
      add constraint service_cases_odoo_sync_status_check
      check (odoo_sync_status in ('pending', 'queued', 'sent', 'failed'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'delivery_proofs'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'delivery_proofs_livraison_id_fkey'
      and con.conrelid = 'public.delivery_proofs'::regclass
  ) then
    alter table public.delivery_proofs
      add constraint delivery_proofs_livraison_id_fkey
      foreign key (livraison_id)
      references public.livraisons_planifiees(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'delivery_media'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'delivery_media_livraison_id_fkey'
      and con.conrelid = 'public.delivery_media'::regclass
  ) then
    alter table public.delivery_media
      add constraint delivery_media_livraison_id_fkey
      foreign key (livraison_id)
      references public.livraisons_planifiees(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'delivery_media'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'delivery_media_proof_id_fkey'
      and con.conrelid = 'public.delivery_media'::regclass
  ) then
    alter table public.delivery_media
      add constraint delivery_media_proof_id_fkey
      foreign key (proof_id)
      references public.delivery_proofs(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'delivery_incidents'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'delivery_incidents_livraison_id_fkey'
      and con.conrelid = 'public.delivery_incidents'::regclass
  ) then
    alter table public.delivery_incidents
      add constraint delivery_incidents_livraison_id_fkey
      foreign key (livraison_id)
      references public.livraisons_planifiees(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'service_cases'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'service_cases_livraison_id_fkey'
      and con.conrelid = 'public.service_cases'::regclass
  ) then
    alter table public.service_cases
      add constraint service_cases_livraison_id_fkey
      foreign key (livraison_id)
      references public.livraisons_planifiees(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'service_cases'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'service_cases_incident_id_fkey'
      and con.conrelid = 'public.service_cases'::regclass
  ) then
    alter table public.service_cases
      add constraint service_cases_incident_id_fkey
      foreign key (incident_id)
      references public.delivery_incidents(id)
      on delete restrict;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'service_cases'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'service_cases_incident_id_key'
      and con.conrelid = 'public.service_cases'::regclass
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
-- Phase A: no RLS changes on new tables (conservative, function-independent).
-- Guarantee on fresh database: CREATE TABLE definitions apply full column shape/defaults/nullability.
-- Conservative behavior on existing database: ADD COLUMN IF NOT EXISTS is additive only; this migration
-- does not enforce/retrofit stricter NOT NULL or data backfill for pre-existing columns/tables.
