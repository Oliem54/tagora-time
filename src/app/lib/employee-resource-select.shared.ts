import {
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { formatFonctionsLabels } from "@/app/lib/employee-fonctions.shared";

export type EmployeeResourceSelectRow = {
  id?: unknown;
  nom?: string | null;
  courriel?: string | null;
  primary_company?: AccountRequestCompany | string | null;
  fonctions?: string[] | null;
  fonction_autre?: string | null;
};

export function buildEmployeeResourceSelectLabel(row: EmployeeResourceSelectRow): string {
  const parts: string[] = [];

  const id = Number(row.id);
  if (Number.isFinite(id)) {
    parts.push(`#${Math.trunc(id)}`);
  }

  const nom = String(row.nom ?? "").trim();
  if (nom) parts.push(nom);

  const courriel = String(row.courriel ?? "").trim();
  if (courriel) parts.push(courriel);

  const fonctionLabel = formatFonctionsLabels(row.fonctions, row.fonction_autre);
  if (fonctionLabel && fonctionLabel !== "—") {
    parts.push(fonctionLabel);
  }

  const company = row.primary_company;
  if (company === "oliem_solutions" || company === "titan_produits_industriels") {
    parts.push(getCompanyLabel(company));
  }

  return parts.join(" · ");
}

export function hasLinkedPortalAccount(authUserId: unknown): boolean {
  return typeof authUserId === "string" && authUserId.trim().length > 0;
}
