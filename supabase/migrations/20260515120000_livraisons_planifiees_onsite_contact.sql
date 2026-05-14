-- Personne a contacter sur place (distinct du client / compagnie).

alter table if exists public.livraisons_planifiees
  add column if not exists contact_name text,
  add column if not exists contact_phone_primary text,
  add column if not exists contact_phone_primary_ext text,
  add column if not exists contact_phone_secondary text,
  add column if not exists contact_phone_secondary_ext text;

comment on column public.livraisons_planifiees.contact_name is
  'Personne a joindre sur place (ex.: representant du site).';
comment on column public.livraisons_planifiees.contact_phone_primary is
  'Telephone principal du contact sur place.';
comment on column public.livraisons_planifiees.contact_phone_primary_ext is
  'Poste / extension du telephone principal.';
comment on column public.livraisons_planifiees.contact_phone_secondary is
  'Telephone secondaire du contact sur place.';
comment on column public.livraisons_planifiees.contact_phone_secondary_ext is
  'Poste / extension du telephone secondaire.';

notify pgrst, 'reload schema';
