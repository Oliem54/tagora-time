-- Jetons à usage unique pour approbation / refus d'exception horodateur depuis courriel/SMS.
-- Le secret brut n'est jamais stocké : seul le hash SHA-256 est conservé.

create table if not exists public.horodateur_exception_action_tokens (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.horodateur_exceptions (id) on delete cascade,
  action text not null check (action in ('approve', 'reject')),
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  used_by_email text null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_horodateur_exception_action_tokens_hash
  on public.horodateur_exception_action_tokens (token_hash);

create index if not exists idx_horodateur_exception_action_tokens_exception_action
  on public.horodateur_exception_action_tokens (exception_id, action);

alter table public.horodateur_exception_action_tokens enable row level security;
