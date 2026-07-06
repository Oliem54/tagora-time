-- TAGORA Compensation Engine Phase 1: Compensation Events (type sale).
-- Fichier migration locale uniquement — ne pas executer en production sans validation explicite.
-- Hors scope: accruals, calculation, API, vues Sales Book, acces employe/Direction.

begin;

-- ---------------------------------------------------------------------------
-- compensation_events
-- ---------------------------------------------------------------------------
create table if not exists public.compensation_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null default 'sale',
  status text not null default 'active',
  sale_state text not null default 'sold',
  chauffeur_id bigint not null references public.chauffeurs (id) on delete restrict,
  amount numeric(14, 2) not null default 0,
  sold_at date null,
  delivered_at date null,
  invoiced_at date null,
  collected_at date null,
  company_context text null,
  external_reference text null,
  label text null,
  notes text null,
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint compensation_events_event_type_phase1_check check (
    event_type = 'sale'
  ),
  constraint compensation_events_status_check check (
    status in ('active', 'cancelled', 'corrected')
  ),
  constraint compensation_events_sale_state_check check (
    sale_state in ('sold', 'delivered', 'invoiced', 'collected')
  ),
  constraint compensation_events_amount_check check (amount >= 0)
);

create index if not exists idx_compensation_events_chauffeur
  on public.compensation_events (chauffeur_id);

create index if not exists idx_compensation_events_event_type
  on public.compensation_events (event_type);

create index if not exists idx_compensation_events_status
  on public.compensation_events (status);

create index if not exists idx_compensation_events_sale_state
  on public.compensation_events (sale_state);

create index if not exists idx_compensation_events_sold_at
  on public.compensation_events (sold_at);

create index if not exists idx_compensation_events_delivered_at
  on public.compensation_events (delivered_at);

comment on table public.compensation_events is
  'Compensation Events Phase 1 (type sale). Source evenementielle du moteur TAGORA Compensation Engine.';

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuse commissions helper when present)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_compensation_events_updated_at on public.compensation_events;
create trigger trg_compensation_events_updated_at
  before update on public.compensation_events
  for each row execute function public.set_commissions_row_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: admin finance via service role / admin policies (pas d acces employe direct)
-- ---------------------------------------------------------------------------
alter table if exists public.compensation_events enable row level security;

drop policy if exists "compensation_events_admin_all" on public.compensation_events;
create policy "compensation_events_admin_all"
  on public.compensation_events
  for all
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

notify pgrst, 'reload schema';

commit;
