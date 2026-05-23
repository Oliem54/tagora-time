-- Moteur global d'actions rapides (Phase 1) — jetons à usage unique, hash SHA-256.
-- Accès serveur uniquement (RLS activé, aucune policy client).

create table if not exists public.app_action_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  action_type text not null,
  module text not null,
  target_type text not null,
  target_id text not null,
  recipient_user_id uuid null references auth.users (id) on delete set null,
  recipient_email text null,
  recipient_phone text null,
  recipient_role text null,
  status text not null default 'pending'
    check (status in ('pending', 'used', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  used_at timestamptz null,
  responded_at timestamptz null,
  response text null
    check (response is null or response in ('accept', 'reject')),
  response_note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  responder_ip inet null,
  responder_user_agent text null,
  constraint app_action_tokens_response_note_required_on_reject check (
    response is distinct from 'reject'
    or (response_note is not null and length(trim(response_note)) > 0)
  )
);

create unique index if not exists idx_app_action_tokens_token_hash
  on public.app_action_tokens (token_hash);

create index if not exists idx_app_action_tokens_status_expires
  on public.app_action_tokens (status, expires_at);

create index if not exists idx_app_action_tokens_module_target
  on public.app_action_tokens (module, target_type, target_id);

create index if not exists idx_app_action_tokens_recipient_user
  on public.app_action_tokens (recipient_user_id)
  where recipient_user_id is not null;

create index if not exists idx_app_action_tokens_pending_target
  on public.app_action_tokens (module, target_type, target_id, created_at desc)
  where status = 'pending';

comment on table public.app_action_tokens is
  'Jetons d''action rapide globaux. Le secret brut n''est jamais stocké ; accès via service role API serveur.';

alter table public.app_action_tokens enable row level security;
