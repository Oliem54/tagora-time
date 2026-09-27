-- Registre append-only des ventes, ajustements et corrections de commission.
-- Aucune suppression de donnees existantes.

create table if not exists public.commission_sale_lines (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.sales_objectives (id) on delete cascade,
  company_context text null,
  kind text not null,
  sale_date date not null,
  reference_code text null,
  label text not null,
  amount numeric(14, 2) not null default 0,
  sales_count integer not null default 0,
  notes text null,
  source text not null default 'manual',
  corrects_line_id uuid null references public.commission_sale_lines (id) on delete restrict,
  created_by uuid null references auth.users (id) on delete set null,
  created_by_name text null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint commission_sale_lines_kind_check check (
    kind in ('sale', 'adjustment', 'correction')
  ),
  constraint commission_sale_lines_source_check check (
    source in ('manual', 'import')
  ),
  constraint commission_sale_lines_label_check check (btrim(label) <> ''),
  constraint commission_sale_lines_correction_check check (
    kind <> 'correction' or corrects_line_id is not null
  )
);

create index if not exists idx_commission_sale_lines_objective
  on public.commission_sale_lines (objective_id, sale_date, created_at);

create unique index if not exists idx_commission_sale_lines_sale_reference
  on public.commission_sale_lines (objective_id, lower(btrim(reference_code)))
  where kind = 'sale'
    and reference_code is not null
    and btrim(reference_code) <> '';

comment on table public.commission_sale_lines is
  'Lignes de ventes et ajustements. Les corrections s ajoutent; elles ne remplacent pas l historique.';

alter table public.commission_sale_lines enable row level security;

drop policy if exists "commission_sale_lines_select" on public.commission_sale_lines;
create policy "commission_sale_lines_select"
  on public.commission_sale_lines
  for select
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
  );

drop policy if exists "commission_sale_lines_insert" on public.commission_sale_lines;
create policy "commission_sale_lines_insert"
  on public.commission_sale_lines
  for insert
  to authenticated
  with check (
    public.is_direction_user()
    and public.has_app_permission('commissions')
  );

drop policy if exists "commission_sale_lines_update" on public.commission_sale_lines;
create policy "commission_sale_lines_update"
  on public.commission_sale_lines
  for update
  to authenticated
  using (
    public.is_direction_user()
    and public.has_app_permission('commissions')
  )
  with check (
    public.is_direction_user()
    and public.has_app_permission('commissions')
  );

notify pgrst, 'reload schema';
