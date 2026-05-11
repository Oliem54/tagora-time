/** Départements et emplacements — affectation effectifs & couverture (TAGORA Time). */

export type EffectifsCompanyKey =
  | "all"
  | "oliem_solutions"
  | "titan_produits_industriels";

/**
 * Entrées canoniques fallback quand la table `effectifs_departments` est absente
 * ou vide (phase 1). L'UI peut surcharger `label`, `companyKey`, `locationKey`,
 * `sortOrder`, `active` via la table DB.
 */
export const EFFECTIFS_DEPARTMENT_ENTRIES = [
  {
    key: "showroom_oliem",
    label: "Showroom Oliem",
    sortOrder: 10,
    companyKey: "oliem_solutions",
    locationKey: "oliem",
    active: true,
  },
  {
    key: "showroom_titan",
    label: "Showroom Titan",
    sortOrder: 20,
    companyKey: "titan_produits_industriels",
    locationKey: "titan",
    active: true,
  },
  {
    key: "montage_voiturette",
    label: "Montage voiturette",
    sortOrder: 30,
    companyKey: "oliem_solutions",
    locationKey: null,
    active: true,
  },
  {
    key: "service_apres_vente",
    label: "Service après vente",
    sortOrder: 40,
    companyKey: "all",
    locationKey: null,
    active: true,
  },
  {
    key: "design_numerique",
    label: "Design numérique",
    sortOrder: 50,
    companyKey: "all",
    locationKey: null,
    active: true,
  },
  {
    key: "operations",
    label: "Opérations",
    sortOrder: 60,
    companyKey: "all",
    locationKey: null,
    active: true,
  },
  {
    key: "livreur",
    label: "Livreur",
    sortOrder: 70,
    companyKey: "all",
    locationKey: null,
    active: true,
  },
  {
    key: "administration",
    label: "Administration",
    sortOrder: 80,
    companyKey: "all",
    locationKey: null,
    active: true,
  },
  {
    key: "autre",
    label: "Autre",
    sortOrder: 90,
    companyKey: "all",
    locationKey: null,
    active: true,
  },
] as const satisfies readonly {
  key: string;
  label: string;
  sortOrder: number;
  companyKey: EffectifsCompanyKey;
  locationKey: string | null;
  active: boolean;
}[];

/** Clé stockée en base : canoniques historiques ou slug personnalisé (voir DEPARTMENT_KEY_SLUG_RE). */
export type EffectifsDepartmentKey = string;

const DEPARTMENT_KEY_SET = new Set<string>(EFFECTIFS_DEPARTMENT_ENTRIES.map((d) => d.key));

/** Slug : minuscules, chiffres, underscores ; 1 à 80 caractères. */
export const DEPARTMENT_KEY_SLUG_RE = /^[a-z0-9_]{1,80}$/;

export function isValidDynamicDepartmentKeySlug(value: string): boolean {
  return DEPARTMENT_KEY_SLUG_RE.test(value.trim());
}

/**
 * Nom d’affichage → clé technique (ex. « Service mobile » → `service_mobile`).
 * Retire les accents, espaces → underscore, garde [a-z0-9_].
 */
export function slugifyDepartmentName(name: string): string {
  const raw = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  const slug = raw.slice(0, 80);
  return slug.length > 0 ? slug : "departement";
}

export function isEffectifsDepartmentKey(value: string): value is EffectifsDepartmentKey {
  const k = value.trim();
  return DEPARTMENT_KEY_SET.has(k) || isValidDynamicDepartmentKeySlug(k);
}

export function normalizeEffectifsDepartmentKey(
  value: string | null | undefined
): EffectifsDepartmentKey | null {
  if (!value || typeof value !== "string") return null;
  const k = value.trim();
  return isEffectifsDepartmentKey(k) ? k : null;
}

export function departmentLabelFromKey(key: EffectifsDepartmentKey): string {
  return EFFECTIFS_DEPARTMENT_ENTRIES.find((d) => d.key === key)?.label ?? key;
}

export const EFFECTIFS_LOCATION_ENTRIES = [
  { key: "oliem", label: "Oliem" },
  { key: "titan", label: "Titan" },
  { key: "entrepot", label: "Entrepôt" },
  { key: "route", label: "Route" },
  { key: "teletravail", label: "Télétravail" },
  { key: "autre", label: "Autre" },
] as const;

export type EffectifsLocationKey = (typeof EFFECTIFS_LOCATION_ENTRIES)[number]["key"];

export function normalizeEffectifsLocationKey(
  value: string | null | undefined
): string | null {
  if (!value || typeof value !== "string") return null;
  const k = value.trim();
  return k.length > 0 ? k : null;
}

export function locationLabelFromKey(key: string | null | undefined): string {
  if (!key) return "—";
  const row = EFFECTIFS_LOCATION_ENTRIES.find((l) => l.key === key);
  return row?.label ?? key;
}

export function sanitizeDepartmentKeyArray(raw: unknown): EffectifsDepartmentKey[] {
  if (!Array.isArray(raw)) return [];
  const out: EffectifsDepartmentKey[] = [];
  for (const item of raw) {
    const k = normalizeEffectifsDepartmentKey(typeof item === "string" ? item : String(item));
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

export function sanitizeLocationKeyArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const s = typeof item === "string" ? item.trim() : String(item ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Clés autorisées pour department_coverage_windows (inclut tous les pôles configurables). */
export const DEPARTMENT_KEYS_FOR_COVERAGE_SQL = EFFECTIFS_DEPARTMENT_ENTRIES.map(
  (d) => `'${d.key}'`
).join(", ");

/**
 * Vrai si un département (phase 1 depuis la table `effectifs_departments` ou le
 * fallback TS) appartient au périmètre d'une compagnie cible.
 *
 * Règles :
 * - cible `all` : on accepte tout département (peu importe sa `companyKey`).
 * - département `companyKey === "all"` : visible dans toutes les compagnies.
 * - sinon : match direct compagnie.
 */
export function departmentMatchesCompany(
  dept: { companyKey: EffectifsCompanyKey },
  targetCompany: EffectifsCompanyKey
): boolean {
  if (targetCompany === "all") return true;
  if (dept.companyKey === "all") return true;
  return dept.companyKey === targetCompany;
}

export function normalizeEffectifsCompanyKey(
  value: unknown
): EffectifsCompanyKey {
  if (typeof value !== "string") return "all";
  const trimmed = value.trim();
  if (
    trimmed === "oliem_solutions" ||
    trimmed === "titan_produits_industriels"
  ) {
    return trimmed;
  }
  return "all";
}
