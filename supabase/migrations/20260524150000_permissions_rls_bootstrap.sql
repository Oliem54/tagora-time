-- Prerequis permissions / RLS pour modules direction (commissions et suivants).
-- Reflete le bootstrap applique manuellement en production le 2026-05-24
-- avant 20260524160000_commissions_objectives_mvp.sql.
-- Source: account_requests.sql (app_permissions) + permissions_and_rls.sql (helpers).
-- Idempotent: safe on fresh env, staging, and production deja bootstrapee.

create table if not exists public.app_permissions (
  slug text primary key,
  label text not null,
  module_key text not null,
  description text,
  sort_order integer not null default 0
);

insert into public.app_permissions (slug, label, module_key, description, sort_order)
values
  ('documents', 'Documents', 'documents', 'Acces aux documents terrain, medias et confirmations.', 10),
  ('dossiers', 'Dossiers', 'dossiers', 'Acces aux dossiers terrain et a leurs notes.', 20),
  ('terrain', 'Terrain', 'terrain', 'Acces aux sorties terrain et operations reliees.', 30),
  ('livraisons', 'Livraisons', 'livraisons', 'Acces a la planification et au suivi des livraisons.', 40),
  ('ressources', 'Ressources', 'ressources', 'Acces aux ressources direction comme vehicules et remorques.', 50),
  ('commissions', 'Commissions', 'commissions', 'Acces au module objectifs de vente et commissions.', 60)
on conflict (slug) do update
set
  label = excluded.label,
  module_key = excluded.module_key,
  description = excluded.description,
  sort_order = excluded.sort_order;

alter table public.app_permissions enable row level security;

drop policy if exists "read_app_permissions" on public.app_permissions;
create policy "read_app_permissions"
  on public.app_permissions
  for select
  to anon, authenticated
  using (true);

create or replace function public.current_app_permissions()
returns text[]
language sql
stable
as $$
  select coalesce(
    array(
      select jsonb_array_elements_text(
        coalesce(
          auth.jwt() -> 'app_metadata' -> 'permissions',
          auth.jwt() -> 'user_metadata' -> 'permissions',
          '[]'::jsonb
        )
      )
    ),
    array[]::text[]
  );
$$;

create or replace function public.has_app_permission(p_permission text)
returns boolean
language sql
stable
as $$
  select
    public.current_app_role() = 'direction'
    and p_permission = any(public.current_app_permissions())
    or (
      public.current_app_role() = 'employe'
      and p_permission = any(public.current_app_permissions())
    );
$$;

create or replace function public.is_direction_user()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'direction';
$$;
