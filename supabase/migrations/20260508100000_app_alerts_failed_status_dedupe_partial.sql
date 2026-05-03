-- Permet plusieurs lignes avec la même dedupe_key une fois l'alerte traitée ;
-- une seule alerte ouverte (ou failed) par dedupe_key à la fois.
-- Ajoute le statut failed pour les alertes d'échec de notification.

drop index if exists public.idx_app_alerts_dedupe_key_unique;

create unique index if not exists idx_app_alerts_dedupe_key_open_unique
  on public.app_alerts (dedupe_key)
  where dedupe_key is not null and status in ('open', 'failed');

alter table public.app_alerts drop constraint if exists app_alerts_status_check;

alter table public.app_alerts
  add constraint app_alerts_status_check check (
    status in ('open', 'handled', 'archived', 'cancelled', 'snoozed', 'failed')
  );
