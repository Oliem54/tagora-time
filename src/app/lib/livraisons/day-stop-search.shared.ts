export type RamassageStatusFilter = "all" | "todo" | "done" | "problem";

const DONE_STATUSES = new Set(["livree", "ramassee", "ramasse"]);
const PROBLEM_STATUSES = new Set(["probleme", "annulee"]);

export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function buildStopSearchBlob(
  row: Record<string, string | number | null | undefined>,
  dossier?: Record<string, string | number | null | undefined> | null
): string {
  const parts: Array<string | number | null | undefined> = [
    row.client,
    row.contact_name,
    row.client_phone,
    row.contact_phone_primary,
    row.contact_phone_secondary,
    row.telephone,
    row.telephone_client,
    row.adresse,
    row.ville,
    row.code_postal,
    row.postal_code,
    row.pickup_address,
    row.item_location,
    row.numero_commande,
    row.commande,
    row.reference,
    row.numero_devis,
    row.devis,
    row.numero_facture,
    row.facture,
    row.commentaire_operationnel,
    row.commentaire,
    row.note_chauffeur,
    dossier?.client,
    dossier?.nom,
    dossier?.numero_commande,
    dossier?.commande,
    dossier?.reference,
    dossier?.numero_devis,
    dossier?.devis,
    dossier?.numero,
    dossier?.numero_facture,
    dossier?.facture,
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
    row.numero_commande || row.commande || row.reference || row.numero_devis || row.devis || ""
  ).trim();
  if (fromRow) return fromRow;
  const fromDossier = String(
    dossier?.numero_commande ||
      dossier?.commande ||
      dossier?.reference ||
      dossier?.numero_devis ||
      dossier?.devis ||
      dossier?.numero ||
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
