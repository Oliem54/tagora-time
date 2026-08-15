alter table if exists public.livraisons_planifiees
  add column if not exists tracking_token text,
  add column if not exists tracking_enabled boolean not null default true,
  add column if not exists client_phone text,
  add column if not exists tracking_sms_sent_at timestamptz;

create unique index if not exists idx_livraisons_planifiees_tracking_token
  on public.livraisons_planifiees (tracking_token)
  where tracking_token is not null;
