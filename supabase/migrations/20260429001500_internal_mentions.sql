create table if not exists public.internal_mentions (
  id bigserial primary key,
  entity_type text not null check (
    entity_type in (
      'livraison',
      'ramassage',
      'blocage_journee',
      'blocage_vehicule',
      'blocage_remorque'
    )
  ),
  entity_id text not null,
  mentioned_user_id uuid null references auth.users(id) on delete set null,
  mentioned_employee_id bigint null,
  mentioned_name text null,
  mentioned_email text null,
  message text not null,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_by_name text null,
  created_by_email text null,
  email_sent boolean not null default false,
  email_sent_at timestamptz null,
  email_error text null,
  read_at timestamptz null,
  status text not null default 'envoye' check (
    status in ('envoye', 'lu', 'erreur_email', 'aucun_courriel')
  ),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_internal_mentions_entity_created
  on public.internal_mentions (entity_type, entity_id, created_at desc);

create index if not exists idx_internal_mentions_mentioned_user_created
  on public.internal_mentions (mentioned_user_id, created_at desc);

alter table public.internal_mentions enable row level security;

drop policy if exists "internal_mentions_select_role_based" on public.internal_mentions;
create policy "internal_mentions_select_role_based"
  on public.internal_mentions
  for select
  to authenticated
  using (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) in ('direction', 'admin', 'manager')
    or mentioned_user_id = auth.uid()
    or created_by_user_id = auth.uid()
  );

drop policy if exists "internal_mentions_insert_direction_admin" on public.internal_mentions;
create policy "internal_mentions_insert_direction_admin"
  on public.internal_mentions
  for insert
  to authenticated
  with check (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) in ('direction', 'admin', 'manager')
  );
