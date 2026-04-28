create table if not exists public.livraison_ramassage_audit_logs (
  id bigserial primary key,
  dossier_id bigint not null,
  dossier_type text not null check (dossier_type in ('livraison', 'ramassage')),
  action text not null check (
    action in (
      'view_dossier',
      'download_zip',
      'open_document',
      'download_document',
      'update_dossier',
      'add_document',
      'delete_document'
    )
  ),
  user_id uuid null references auth.users(id) on delete set null,
  user_email text null,
  user_role text null,
  details jsonb not null default '{}'::jsonb,
  ip_address text null,
  user_agent text null,
  document_id text null,
  document_name text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_lr_audit_logs_dossier_created_at
  on public.livraison_ramassage_audit_logs (dossier_type, dossier_id, created_at desc);

create index if not exists idx_lr_audit_logs_action_created_at
  on public.livraison_ramassage_audit_logs (action, created_at desc);

alter table public.livraison_ramassage_audit_logs enable row level security;

drop policy if exists "lr_audit_logs_select_direction_admin" on public.livraison_ramassage_audit_logs;
create policy "lr_audit_logs_select_direction_admin"
  on public.livraison_ramassage_audit_logs
  for select
  to authenticated
  using (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) in ('direction', 'admin', 'manager')
  );

drop policy if exists "lr_audit_logs_insert_direction_admin" on public.livraison_ramassage_audit_logs;
create policy "lr_audit_logs_insert_direction_admin"
  on public.livraison_ramassage_audit_logs
  for insert
  to authenticated
  with check (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ) in ('direction', 'admin', 'manager')
  );
