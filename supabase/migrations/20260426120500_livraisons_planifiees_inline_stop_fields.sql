alter table public.livraisons_planifiees
  add column if not exists ville text,
  add column if not exists code_postal text,
  add column if not exists province text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists note_chauffeur text,
  add column if not exists commentaire_operationnel text;
