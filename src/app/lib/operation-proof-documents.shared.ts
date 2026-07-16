import type { AppRole } from "@/app/lib/auth/roles";
import { extractPhotosDossiersObjectPath } from "@/app/lib/storage/photos-dossiers-contract.shared";

export type OperationProofModuleSource =
  | "dossier"
  | "livraison"
  | "ramassage"
  | "service_case"
  | "helpdesk_ticket"
  | "delivery_incident";

export type OperationDocumentCategory =
  | "facture"
  | "bon_livraison"
  | "bon_ramassage"
  | "preuve_signee"
  | "photo"
  | "autre";

export type DocumentBadgeKind = "BL" | "Facture" | "Preuve" | "Photo" | "Autre";

const SENSITIVE_CATEGORIES = new Set<OperationDocumentCategory>([
  "facture",
  "bon_livraison",
  "bon_ramassage",
]);

export function blCategoryForModule(
  moduleSource: OperationProofModuleSource
): OperationDocumentCategory {
  return moduleSource === "ramassage" ? "bon_ramassage" : "bon_livraison";
}

export function getDocumentBadgeLabel(
  categorie: string | null,
  _moduleSource: OperationProofModuleSource
): DocumentBadgeKind {
  if (categorie === "facture") return "Facture";
  if (categorie === "photo") return "Photo";
  if (categorie === "preuve_signee") return "Preuve";
  if (categorie === "autre") return "Autre";
  if (categorie === "bon_livraison" || categorie === "bon_ramassage") return "BL";
  if (!categorie) return "Autre";
  return "Autre";
}

export function extractStoragePathFromProofUrl(url: string, bucket: string) {
  // H5-F5A: support public/sign URLs, storage:// refs, and raw object paths.
  return extractPhotosDossiersObjectPath(url, bucket);
}

export function canDeleteOperationDocument(options: {
  role: AppRole | null;
  userId: string | null;
  creePar: string | null;
  categorie: string | null;
}): boolean {
  const { role, userId, creePar, categorie } = options;
  if (!userId) return false;
  if (role === "admin" || role === "direction") return true;
  if (creePar !== userId) return false;
  if (!categorie) return true;
  return !SENSITIVE_CATEGORIES.has(categorie as OperationDocumentCategory);
}

export const DOCUMENT_BADGE_STYLES: Record<
  DocumentBadgeKind,
  { background: string; color: string; border: string }
> = {
  BL: { background: "#e0f2fe", color: "#0c4a6e", border: "#7dd3fc" },
  Facture: { background: "#fef3c7", color: "#92400e", border: "#fcd34d" },
  Preuve: { background: "#dcfce7", color: "#166534", border: "#86efac" },
  Photo: { background: "#ede9fe", color: "#5b21b6", border: "#c4b5fd" },
  Autre: { background: "#f1f5f9", color: "#334155", border: "#cbd5e1" },
};
