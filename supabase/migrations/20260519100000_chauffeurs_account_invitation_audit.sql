-- Audit invitation / accès portail depuis la fiche employé (Agent 5 — comptes utilisateurs)
alter table if exists public.chauffeurs
  add column if not exists account_invited_at timestamptz,
  add column if not exists account_invited_by_user_id uuid,
  add column if not exists account_invited_by_name text,
  add column if not exists account_invitation_status text,
  add column if not exists account_invitation_error text;

comment on column public.chauffeurs.account_invited_at is
  'Dernière invitation ou liaison de compte portail (horodatage UTC).';
comment on column public.chauffeurs.account_invited_by_user_id is
  'Utilisateur Auth (direction/admin) ayant envoyé l''invitation ou effectué la liaison.';
comment on column public.chauffeurs.account_invited_by_name is
  'Courriel ou libellé du compte ayant invité (affichage fiche employé).';
comment on column public.chauffeurs.account_invitation_status is
  'none | invited | active | disabled | error | linked — dernier état connu côté fiche.';
comment on column public.chauffeurs.account_invitation_error is
  'Message d''erreur si le dernier envoi invitation / liaison a échoué.';

notify pgrst, 'reload schema';
