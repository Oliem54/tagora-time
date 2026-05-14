-- Ramassages (livraisons_planifiees.type_operation = ramassage_client) :
-- emplacement article + lieu de rencontre optionnel (defaut API : Oliem Solutions).

alter table if exists public.livraisons_planifiees
  add column if not exists item_location text null;

alter table if exists public.livraisons_planifiees
  add column if not exists pickup_address text null;

comment on column public.livraisons_planifiees.item_location is
  'Emplacement de l''article a remettre au client (preparation ramassage / remise).';

comment on column public.livraisons_planifiees.pickup_address is
  'Adresse ou libelle du lieu de ramassage; defaut cote API pour ramassage_client : Oliem Solutions.';

notify pgrst, 'reload schema';
