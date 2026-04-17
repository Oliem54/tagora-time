alter table if exists public.chauffeurs
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists idx_chauffeurs_auth_user_id
  on public.chauffeurs (auth_user_id)
  where auth_user_id is not null;
