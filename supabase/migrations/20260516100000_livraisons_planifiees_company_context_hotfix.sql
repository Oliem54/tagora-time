-- Secours idempotent : bases locales / branches sans 20260410_120000 appliquee.
-- Alignement avec le modele produit (compagnie Oliem / Titan sur les livraisons).
-- PostgREST : recharger le schema cache apres ajout de colonne.

alter table if exists public.livraisons_planifiees
  add column if not exists company_context text;

update public.livraisons_planifiees
set company_context = 'oliem_solutions'
where company_context is null;

alter table if exists public.livraisons_planifiees
  alter column company_context set not null;

alter table if exists public.livraisons_planifiees
  drop constraint if exists livraisons_planifiees_company_context_check;

alter table if exists public.livraisons_planifiees
  add constraint livraisons_planifiees_company_context_check
  check (company_context in ('oliem_solutions', 'titan_produits_industriels'));

create index if not exists idx_livraisons_planifiees_company_context
  on public.livraisons_planifiees (company_context, date_livraison desc);

notify pgrst, 'reload schema';
