/**
 * Fonctions opérationnelles des employés (table chauffeurs).
 * Indépendant des rôles portail (admin / direction / employé).
 */

export const EMPLOYEE_FONCTION_OPTIONS = [
  { slug: "technicien", label: "Technicien" },
  { slug: "vendeur", label: "Vendeur" },
  { slug: "livreur", label: "Livreur" },
  { slug: "service", label: "Service" },
  { slug: "admin", label: "Admin" },
  { slug: "media", label: "Média" },
  { slug: "entretien", label: "Entretien" },
  { slug: "autre", label: "Autre" },
] as const;

export type EmployeFonctionSlug = (typeof EMPLOYEE_FONCTION_OPTIONS)[number]["slug"];

const SLUG_SET = new Set<string>(EMPLOYEE_FONCTION_OPTIONS.map((o) => o.slug));

const LABEL_BY_SLUG = new Map<string, string>(
  EMPLOYEE_FONCTION_OPTIONS.map((o) => [o.slug, o.label])
);

export function normalizeFonctionsFromProfile(raw: unknown): EmployeFonctionSlug[] {
  if (!Array.isArray(raw)) return [];
  const out: EmployeFonctionSlug[] = [];
  for (const item of raw) {
    const s = String(item).toLowerCase().trim();
    if (SLUG_SET.has(s) && !out.includes(s as EmployeFonctionSlug)) {
      out.push(s as EmployeFonctionSlug);
    }
  }
  return out;
}

/**
 * Pool livreur / chauffeur pour les **nouvelles** sélections (listes, filtres, mentions).
 * Uniquement si `fonctions` (tableau) contient le slug « livreur ».
 * Pas de repli sur `can_deliver` (ancien indicateur trop large).
 * Pour une ligne déjà assignée à un employé hors pool, fusionner l’assigné au niveau de l’UI (ex. chauffeursPourSelectLivraison).
 */
export function isChauffeurDeliveryPoolMember(row: Record<string, unknown>): boolean {
  const fonctions = row.fonctions;
  if (!Array.isArray(fonctions)) return false;
  return fonctions.some((f) => String(f).toLowerCase() === "livreur");
}

export function formatFonctionsLabels(
  slugs: string[] | null | undefined,
  fonctionAutre?: string | null
): string {
  if (!Array.isArray(slugs) || slugs.length === 0) return "—";
  const lower = slugs.map((s) => String(s).toLowerCase());
  const hasAutre = lower.includes("autre");
  const autres = slugs.filter((_, i) => lower[i] !== "autre");
  const parts = autres.map(
    (s) => LABEL_BY_SLUG.get(String(s).toLowerCase()) ?? String(s)
  );
  if (hasAutre) {
    const autrePart = fonctionAutre?.trim()
      ? `Autre : ${fonctionAutre.trim()}`
      : "Autre";
    parts.push(autrePart);
  }
  return parts.join(" / ");
}
