-- Paiement client sur livraisons_planifiees (livraison_client + ramassage_client).

alter table if exists public.livraisons_planifiees
  add column if not exists payment_status text not null default 'paid';

alter table if exists public.livraisons_planifiees
  add column if not exists payment_balance_due numeric(10, 2) not null default 0;

alter table if exists public.livraisons_planifiees
  add column if not exists payment_method text null;

alter table if exists public.livraisons_planifiees
  add column if not exists payment_note text null;

alter table if exists public.livraisons_planifiees
  add column if not exists payment_confirmed_at timestamptz null;

alter table if exists public.livraisons_planifiees
  add column if not exists payment_confirmed_by_user_id uuid null;

alter table if exists public.livraisons_planifiees
  add column if not exists payment_confirmed_by_name text null;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'livraisons_planifiees'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'livraisons_planifiees_payment_status_check'
      and con.conrelid = 'public.livraisons_planifiees'::regclass
  ) then
    alter table public.livraisons_planifiees
      add constraint livraisons_planifiees_payment_status_check
      check (
        payment_status in ('paid', 'balance_due', 'confirmed_on_delivery')
      );
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'livraisons_planifiees'
  ) and not exists (
    select 1
    from pg_constraint con
    where con.conname = 'livraisons_planifiees_payment_confirmed_by_user_id_fkey'
      and con.conrelid = 'public.livraisons_planifiees'::regclass
  ) then
    alter table public.livraisons_planifiees
      add constraint livraisons_planifiees_payment_confirmed_by_user_id_fkey
      foreign key (payment_confirmed_by_user_id)
      references auth.users (id)
      on delete set null;
  end if;
end $$;

comment on column public.livraisons_planifiees.payment_status is
  'paid | balance_due | confirmed_on_delivery';

comment on column public.livraisons_planifiees.payment_balance_due is
  'Montant restant a collecter (dollars).';

comment on column public.livraisons_planifiees.payment_method is
  'Methode prevue ou recue (texte libre : Comptant, Interac, etc.).';

comment on column public.livraisons_planifiees.payment_note is
  'Note interne sur le paiement.';

comment on column public.livraisons_planifiees.payment_confirmed_at is
  'Horodatage confirmation paiement au moment de la remise.';

comment on column public.livraisons_planifiees.payment_confirmed_by_user_id is
  'Utilisateur ayant confirme le paiement recu.';

comment on column public.livraisons_planifiees.payment_confirmed_by_name is
  'Nom affiche de l utilisateur ayant confirme le paiement.';

notify pgrst, 'reload schema';
