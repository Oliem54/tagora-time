export type RamassageStatusFilter = "all" | "todo" | "done" | "problem";

export type StopSearchContext = {
  chauffeurLabel?: string;
  companyLabel?: string;
  statusLabel?: string;
  vehiculeId?: string;
  remorqueId?: string;
};

const DONE_STATUSES = new Set(["livree", "ramassee", "ramasse"]);
const PROBLEM_STATUSES = new Set(["probleme", "annulee"]);

/** Normalise pour recherche tolérante (casse, accents, ponctuation, espaces). */
export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildStopSearchBlob(
  row: Record<string, string | number | null | undefined>,
  dossier?: Record<string, string | number | null | undefined> | null,
  context?: StopSearchContext | null
): string {
  const parts: Array<string | number | null | undefined> = [
    row.id,
    row.client,
    row.nom_client,
    row.contact_name,
    row.company_context,
    row.company,
    row.compagnie,
    row.statut,
    row.type_operation,
    row.client_phone,
    row.contact_phone_primary,
    row.contact_phone_primary_ext,
    row.contact_phone_secondary,
    row.contact_phone_secondary_ext,
    row.telephone,
    row.telephone_client,
    row.courriel,
    row.email,
    row.contact_email,
    row.adresse,
    row.ville,
    row.code_postal,
    row.postal_code,
    row.province,
    row.pays,
    row.pickup_address,
    row.item_location,
    row.chantier,
    row.site,
    row.projet,
    row.lieu_chantier,
    row.produit,
    row.description,
    row.designation,
    row.marchandise,
    row.numero_commande,
    row.commande,
    row.reference,
    row.reference_interne,
    row.numero_devis,
    row.devis,
    row.numero_facture,
    row.facture,
    row.numero_bl,
    row.bon_livraison,
    row.bl,
    row.numero_bon_livraison,
    row.commentaire_operationnel,
    row.commentaire,
    row.notes,
    row.note_chauffeur,
    row.chauffeur_id,
    row.chauffeur,
    row.vehicule_id,
    row.remorque_id,
    dossier?.client,
    dossier?.nom,
    dossier?.nom_client,
    dossier?.company,
    dossier?.compagnie,
    dossier?.numero_commande,
    dossier?.commande,
    dossier?.reference,
    dossier?.reference_interne,
    dossier?.numero_devis,
    dossier?.devis,
    dossier?.numero,
    dossier?.numero_facture,
    dossier?.facture,
    dossier?.numero_bl,
    dossier?.bon_livraison,
    dossier?.bl,
    dossier?.titre,
    dossier?.courriel,
    dossier?.email,
    dossier?.chantier,
    dossier?.produit,
    dossier?.description,
    context?.chauffeurLabel,
    context?.companyLabel,
    context?.statusLabel,
    context?.vehiculeId,
    context?.remorqueId,
  ];
  return normalizeSearchText(parts.map((part) => String(part ?? "")).join(" "));
}

export function matchesStopSearch(blob: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return tokens.every((token) => blob.includes(token));
}

export function matchesRamassageStatusFilter(
  rawStatut: string | null | undefined,
  filter: RamassageStatusFilter
): boolean {
  const statut = String(rawStatut || "").trim().toLowerCase();
  if (filter === "all") return true;
  if (filter === "done") return DONE_STATUSES.has(statut);
  if (filter === "problem") return PROBLEM_STATUSES.has(statut);
  return !DONE_STATUSES.has(statut) && !PROBLEM_STATUSES.has(statut);
}

export function getStopCommandeLabel(
  row: Record<string, string | number | null | undefined>,
  dossier?: Record<string, string | number | null | undefined> | null
): string {
  const fromRow = String(
    row.numero_commande ||
      row.commande ||
      row.reference ||
      row.reference_interne ||
      row.numero_devis ||
      row.devis ||
      row.numero_bl ||
      row.bon_livraison ||
      row.bl ||
      ""
  ).trim();
  if (fromRow) return fromRow;
  const fromDossier = String(
    dossier?.numero_commande ||
      dossier?.commande ||
      dossier?.reference ||
      dossier?.reference_interne ||
      dossier?.numero_devis ||
      dossier?.devis ||
      dossier?.numero ||
      dossier?.numero_bl ||
      dossier?.bon_livraison ||
      dossier?.bl ||
      ""
  ).trim();
  return fromDossier;
}

export function getStopFactureLabel(
  row: Record<string, string | number | null | undefined>,
  dossier?: Record<string, string | number | null | undefined> | null
): string {
  const fromRow = String(row.numero_facture || row.facture || "").trim();
  if (fromRow) return fromRow;
  return String(dossier?.numero_facture || dossier?.facture || "").trim();
}
