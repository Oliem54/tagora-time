alter table if exists public.chauffeurs
  add column if not exists expected_breaks_count integer not null default 0,
  add column if not exists break_1_label text,
  add column if not exists break_1_minutes integer,
  add column if not exists break_1_paid boolean not null default true,
  add column if not exists break_2_label text,
  add column if not exists break_2_minutes integer,
  add column if not exists break_2_paid boolean not null default true,
  add column if not exists break_3_label text,
  add column if not exists break_3_minutes integer,
  add column if not exists break_3_paid boolean not null default true;

update public.chauffeurs
set
  expected_breaks_count = case
    when coalesce(pause_minutes, 0) > 0 then greatest(expected_breaks_count, 1)
    else expected_breaks_count
  end,
  break_1_label = coalesce(break_1_label, case when coalesce(pause_minutes, 0) > 0 then 'Pause 1' else null end),
  break_1_minutes = coalesce(break_1_minutes, pause_minutes),
  break_1_paid = coalesce(break_1_paid, true)
where coalesce(pause_minutes, 0) > 0;
