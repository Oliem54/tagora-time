-- Affectation effectifs étendue (départements multiples, emplacements, livraison, planification).

alter table public.chauffeurs
  add column if not exists effectifs_secondary_department_keys text[] not null default '{}';

alter table public.chauffeurs
  add column if not exists effectifs_primary_location text null;

alter table public.chauffeurs
  add column if not exists effectifs_secondary_locations text[] not null default '{}';

alter table public.chauffeurs
  add column if not exists can_deliver boolean not null default false;

alter table public.chauffeurs
  add column if not exists default_weekly_hours numeric null;

alter table public.chauffeurs
  add column if not exists schedule_active boolean not null default true;

comment on column public.chauffeurs.effectifs_secondary_department_keys is
  'Départements effectifs secondaires (clés TAGORA).';
comment on column public.chauffeurs.effectifs_primary_location is
  'Emplacement principal effectifs (clé libre ou canonique).';
comment on column public.chauffeurs.effectifs_secondary_locations is
  'Emplacements secondaires.';
comment on column public.chauffeurs.can_deliver is
  'Peut effectuer des livraisons (effectifs / planification).';
comment on column public.chauffeurs.default_weekly_hours is
  'Heures hebdomadaires prévues pour la planification effectifs.';
comment on column public.chauffeurs.schedule_active is
  'Horaire pris en compte pour la planification / couverture.';

-- Élargir les départements autorisés sur chauffeurs et fenêtres de couverture.
alter table public.chauffeurs
  drop constraint if exists chauffeurs_effectifs_department_key_check;

alter table public.chauffeurs
  add constraint chauffeurs_effectifs_department_key_check
  check (
    effectifs_department_key is null
    or effectifs_department_key in (
      'showroom_oliem',
      'showroom_titan',
      'montage_voiturette',
      'service_apres_vente',
      'design_numerique',
      'operations',
      'livreur',
      'administration',
      'autre'
    )
  );

alter table public.department_coverage_windows
  drop constraint if exists department_coverage_windows_department_key_check;

alter table public.department_coverage_windows
  add constraint department_coverage_windows_department_key_check
  check (
    department_key in (
      'showroom_oliem',
      'showroom_titan',
      'montage_voiturette',
      'service_apres_vente',
      'design_numerique',
      'operations',
      'livreur',
      'administration',
      'autre'
    )
  );
