-- ============================================================
-- 6E.2C-GAP bridge — missing chauffeurs horodateur settings
-- Source definitions: 20260418140000_horodateur_phase1_schema.sql
-- Idempotent. Additive only. No data mutation. No history repair.
-- ============================================================

begin;

alter table if exists public.chauffeurs
  add column if not exists horodateur_tolerance_before_start_minutes integer not null default 0,
  add column if not exists horodateur_tolerance_after_end_minutes integer not null default 0,
  add column if not exists horodateur_max_shift_minutes integer not null default 720;

do $$
begin
  if to_regclass('public.chauffeurs') is null then
    return;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chauffeurs_horodateur_tolerance_before_start_minutes_check'
      and conrelid = 'public.chauffeurs'::regclass
  ) then
    alter table public.chauffeurs
      add constraint chauffeurs_horodateur_tolerance_before_start_minutes_check
      check (horodateur_tolerance_before_start_minutes >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chauffeurs_horodateur_tolerance_after_end_minutes_check'
      and conrelid = 'public.chauffeurs'::regclass
  ) then
    alter table public.chauffeurs
      add constraint chauffeurs_horodateur_tolerance_after_end_minutes_check
      check (horodateur_tolerance_after_end_minutes >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chauffeurs_horodateur_max_shift_minutes_check'
      and conrelid = 'public.chauffeurs'::regclass
  ) then
    alter table public.chauffeurs
      add constraint chauffeurs_horodateur_max_shift_minutes_check
      check (horodateur_max_shift_minutes > 0);
  end if;
end $$;

comment on column public.chauffeurs.horodateur_tolerance_before_start_minutes is
  '6E.2C-GAP bridge: minutes allowed before scheduled start (from 20260418140000).';

comment on column public.chauffeurs.horodateur_tolerance_after_end_minutes is
  '6E.2C-GAP bridge: minutes allowed after scheduled end (from 20260418140000).';

comment on column public.chauffeurs.horodateur_max_shift_minutes is
  '6E.2C-GAP bridge: maximum shift length in minutes (from 20260418140000).';

commit;
