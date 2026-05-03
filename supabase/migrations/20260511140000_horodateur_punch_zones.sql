-- Zones de punch QR + métadonnées sur les événements horodateur.

do $$
begin
  alter type public.horodateur_source_kind add value 'qr';
exception
  when duplicate_object then null;
end $$;

create table if not exists public.horodateur_punch_zones (
  id uuid primary key default gen_random_uuid(),
  zone_key text not null,
  label text not null,
  company_key text not null default 'all',
  location_key text null,
  token_hash text not null,
  active boolean not null default true,
  requires_gps boolean not null default false,
  latitude numeric null,
  longitude numeric null,
  radius_meters integer null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint horodateur_punch_zones_zone_key_key unique (zone_key),
  constraint horodateur_punch_zones_company_key_check check (
    company_key in ('all', 'oliem_solutions', 'titan_produits_industriels')
  ),
  constraint horodateur_punch_zones_radius_check check (
    radius_meters is null or radius_meters > 0
  )
);

create index if not exists idx_horodateur_punch_zones_active
  on public.horodateur_punch_zones (active, zone_key);

create or replace function public.horodateur_punch_zones_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_horodateur_punch_zones_updated_at on public.horodateur_punch_zones;
create trigger trg_horodateur_punch_zones_updated_at
  before update on public.horodateur_punch_zones
  for each row execute function public.horodateur_punch_zones_touch_updated_at();

alter table if exists public.horodateur_events
  add column if not exists punch_source text null,
  add column if not exists punch_zone_key text null,
  add column if not exists punch_zone_id uuid null references public.horodateur_punch_zones (id) on delete set null,
  add column if not exists zone_validated boolean null,
  add column if not exists gps_latitude numeric null,
  add column if not exists gps_longitude numeric null,
  add column if not exists work_company_key text null,
  add column if not exists employer_company_key text null;

alter table if exists public.horodateur_events
  drop constraint if exists horodateur_events_work_company_key_check;

alter table if exists public.horodateur_events
  add constraint horodateur_events_work_company_key_check
  check (
    work_company_key is null
    or work_company_key in ('oliem_solutions', 'titan_produits_industriels')
  );

alter table if exists public.horodateur_events
  drop constraint if exists horodateur_events_employer_company_key_check;

alter table if exists public.horodateur_events
  add constraint horodateur_events_employer_company_key_check
  check (
    employer_company_key is null
    or employer_company_key in ('oliem_solutions', 'titan_produits_industriels')
  );

alter table if exists public.horodateur_punch_zones enable row level security;

-- Pas d'accès direct client : les routes API utilisent le service role.
create policy "horodateur_punch_zones_no_direct"
  on public.horodateur_punch_zones
  for all
  using (false)
  with check (false);
