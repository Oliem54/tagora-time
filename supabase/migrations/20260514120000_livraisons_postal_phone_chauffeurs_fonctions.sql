-- Colonnes livraisons_planifiees alignées avec l'API (évite erreurs schema cache / PGRST).
-- client_phone : déjà prévue dans 20260411 ; idempotent pour bases en retard.
-- postal_code : alias explicite côté produit (redondant avec code_postal, synchronisé par l'API).
-- chauffeurs.fonctions / fonction_autre : rôles opérationnels (≠ permissions portail).

alter table if exists public.livraisons_planifiees
  add column if not exists client_phone text,
  add column if not exists postal_code text;

update public.livraisons_planifiees
set postal_code = nullif(trim(code_postal), '')
where (postal_code is null or trim(coalesce(postal_code, '')) = '')
  and code_postal is not null
  and trim(code_postal) <> '';

alter table if exists public.chauffeurs
  add column if not exists fonctions text[] not null default '{}'::text[];

alter table if exists public.chauffeurs
  add column if not exists fonction_autre text;

comment on column public.chauffeurs.fonctions is
  'Fonctions opérationnelles (technicien, vendeur, livreur, …). Ne confère pas de droits portail.';
comment on column public.chauffeurs.fonction_autre is
  'Précision libre lorsque la fonction « autre » est cochée.';

-- Pas de backfill automatique can_deliver -> fonctions livreur : si can_deliver
-- etait vrai pour trop de monde, cela reclasserait tout le monde Livreur.
-- Affecter explicitement la fonction Livreur via l app / SQL apres audit.

notify pgrst, 'reload schema';
