/**
 * Bloc 6B — Catalogue de catégories + paramètres commissions par organisation.
 *
 * Couche pure (types, validateurs, helpers multi-tenant). Aucune I/O ni UI.
 *
 * Convention officielle organization_id :
 * - trim() + lower()
 * - charset a-z 0-9 _
 * - immuable après création
 * - identifiant logique multi-tenant (= company_context / primary_company)
 * - jamais le nom affiché de l’organisation
 */

import {
  COMMISSION_CATEGORY_V1_KEYS,
  COMMISSION_CATEGORY_V1_LABELS,
  type CommissionCategoryKey,
} from "@/app/lib/commissions/commission-plan.shared";

// ---------------------------------------------------------------------------
// Catégories (modèle org)
// ---------------------------------------------------------------------------

export type CommissionCategoryRow = {
  id: string;
  organization_id: string;
  code: string;
  label: string;
  description: string | null;
  display_order: number;
  /** Masquée: absente de l’assistant normal; historique lisible. */
  is_visible: boolean;
  /** Désactivée: non sélectionnable pour un nouveau plan; historique lisible. */
  is_active: boolean;
  is_system_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CommissionCategoryDefaultSeed = {
  code: CommissionCategoryKey;
  label: string;
  display_order: number;
  is_visible: true;
  is_active: true;
  is_system_default: true;
};

/** Sept catégories V1 (ordre d’affichage par défaut). */
export const COMMISSION_CATEGORY_V1_DEFAULTS: readonly CommissionCategoryDefaultSeed[] =
  COMMISSION_CATEGORY_V1_KEYS.map((code, index) => ({
    code,
    label: COMMISSION_CATEGORY_V1_LABELS[code],
    display_order: (index + 1) * 10,
    is_visible: true as const,
    is_active: true as const,
    is_system_default: true as const,
  }));

/**
 * Assistant normal: visible + active.
 * Masquée (is_visible=false) mais active: hors assistant; encore utilisable
 * en configuration avancée / historique (voir isCategorySelectableForNewPlan).
 */
export function isCategoryVisibleInWizard(
  category: Pick<CommissionCategoryRow, "is_visible" | "is_active">
): boolean {
  return category.is_visible && category.is_active;
}

/**
 * Nouveau plan: seule is_active compte.
 * Masquée + active → encore sélectionnable hors assistant normal.
 * Inactive → non sélectionnable, données historiques conservées.
 */
export function isCategorySelectableForNewPlan(
  category: Pick<CommissionCategoryRow, "is_active">
): boolean {
  return category.is_active;
}

/** Masquée ou désactivée: les anciennes données restent toujours lisibles. */
export function isCategoryHistoricallyReadable(
  category: Pick<CommissionCategoryRow, "is_visible" | "is_active">
): boolean {
  void category;
  return true;
}

const CATEGORY_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/;
const ORGANIZATION_ID_RE = /^[a-z0-9_]+$/;

/**
 * Normalise organization_id selon la convention officielle.
 * Retourne null si invalide (ne jamais accepter un libellé affiché).
 */
export function normalizeOrganizationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!ORGANIZATION_ID_RE.test(normalized)) return null;
  return normalized;
}

export function normalizeCategoryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!CATEGORY_CODE_RE.test(normalized)) return null;
  return normalized;
}

export function validateCategoryLabel(label: unknown): {
  ok: true;
  label: string;
} | { ok: false; error: string } {
  if (typeof label !== "string" || label.trim() === "") {
    return { ok: false, error: "Le libellé de la catégorie est obligatoire." };
  }
  return { ok: true, label: label.trim() };
}

export type SeedCategoryInput = {
  organization_id: string;
  code: string;
  label: string;
  display_order: number;
  is_visible?: boolean;
  is_active?: boolean;
  is_system_default?: boolean;
};

/**
 * Fusion idempotente du seed V1: n’écrase jamais une catégorie déjà présente
 * (personnalisée ou non) pour le même (organization_id, code).
 */
export function mergeCategorySeedIdempotent(
  existing: readonly Pick<CommissionCategoryRow, "organization_id" | "code" | "label">[],
  organizationId: string,
  defaults: readonly CommissionCategoryDefaultSeed[] = COMMISSION_CATEGORY_V1_DEFAULTS
): SeedCategoryInput[] {
  const org = normalizeOrganizationId(organizationId);
  if (!org) return [];

  const existingCodes = new Set(
    existing
      .filter((row) => row.organization_id === org)
      .map((row) => row.code)
  );

  return defaults
    .filter((item) => !existingCodes.has(item.code))
    .map((item) => ({
      organization_id: org,
      code: item.code,
      label: item.label,
      display_order: item.display_order,
      is_visible: item.is_visible,
      is_active: item.is_active,
      is_system_default: item.is_system_default,
    }));
}

// ---------------------------------------------------------------------------
// Paramètres organisation
// ---------------------------------------------------------------------------

export const DEFAULT_PERCENTAGE_BASIS = "net_sales_ex_tax" as const;
export type DefaultPercentageBasis = typeof DEFAULT_PERCENTAGE_BASIS;

/** Base % V1: ventes nettes hors taxes, après rabais, hors transport/frais admin, après retours. */
export const DEFAULT_PERCENTAGE_BASIS_DESCRIPTION =
  "Ventes nettes hors taxes, après rabais, hors transport, hors frais administratifs, après retours et crédits.";

export const ROUNDING_MODES = [
  "half_up",
  "half_even",
  "floor",
  "ceil",
] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export const COMPLETION_TRIGGERS = [
  "sale_completed",
  "product_or_vehicle_delivered",
  "service_completed_and_invoiced",
  "sale_completed_delivered_or_invoiced",
] as const;
export type CompletionTrigger = (typeof COMPLETION_TRIGGERS)[number];

export type CommissionOrganizationSettings = {
  organization_id: string;
  /** ISO 4217 — défaut CAD pour compatibilité, jamais exclusive. */
  currency_code: string;
  default_percentage_basis: DefaultPercentageBasis;
  default_warranty_eligible: boolean;
  rounding_precision: number;
  rounding_mode: RoundingMode;
  default_completion_trigger: CompletionTrigger;
  /** Feature flag / abonnement futur — non branché au moteur ici. */
  simple_commission_plans_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_ORGANIZATION_SETTINGS_VALUES = {
  currency_code: "CAD",
  default_percentage_basis: DEFAULT_PERCENTAGE_BASIS,
  default_warranty_eligible: false,
  rounding_precision: 2,
  rounding_mode: "half_up" as RoundingMode,
  default_completion_trigger:
    "sale_completed_delivered_or_invoiced" as CompletionTrigger,
  simple_commission_plans_enabled: false,
} as const;

const ISO_CURRENCY_RE = /^[A-Z]{3}$/;

export function normalizeCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  if (!ISO_CURRENCY_RE.test(code)) return null;
  return code;
}

export function validateCurrencyCode(value: unknown): {
  ok: true;
  currency_code: string;
} | { ok: false; error: string } {
  const code = normalizeCurrencyCode(value);
  if (!code) {
    return {
      ok: false,
      error: "Le code devise doit être un code ISO 4217 valide (3 lettres).",
    };
  }
  return { ok: true, currency_code: code };
}

export function validateRoundingPrecision(value: unknown): {
  ok: true;
  rounding_precision: number;
} | { ok: false; error: string } {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6) {
    return {
      ok: false,
      error: "La précision d’arrondi doit être un entier entre 0 et 6.",
    };
  }
  return { ok: true, rounding_precision: value };
}

export function validateRoundingMode(value: unknown): {
  ok: true;
  rounding_mode: RoundingMode;
} | { ok: false; error: string } {
  if (typeof value !== "string" || !ROUNDING_MODES.includes(value as RoundingMode)) {
    return { ok: false, error: "Mode d’arrondi invalide." };
  }
  return { ok: true, rounding_mode: value as RoundingMode };
}

export function validateCompletionTrigger(value: unknown): {
  ok: true;
  default_completion_trigger: CompletionTrigger;
} | { ok: false; error: string } {
  if (
    typeof value !== "string" ||
    !COMPLETION_TRIGGERS.includes(value as CompletionTrigger)
  ) {
    return { ok: false, error: "Déclencheur de calcul invalide." };
  }
  return {
    ok: true,
    default_completion_trigger: value as CompletionTrigger,
  };
}

export function buildDefaultOrganizationSettings(
  organizationId: string
): Omit<CommissionOrganizationSettings, "created_at" | "updated_at"> | null {
  const org = normalizeOrganizationId(organizationId);
  if (!org) return null;
  return {
    organization_id: org,
    ...DEFAULT_ORGANIZATION_SETTINGS_VALUES,
  };
}

// ---------------------------------------------------------------------------
// Isolation multi-tenant (miroir logique des policies RLS)
// ---------------------------------------------------------------------------

export function userCanAccessOrganization(
  actorOrganizationIds: readonly string[],
  organizationId: string
): boolean {
  const org = normalizeOrganizationId(organizationId);
  if (!org) return false;
  return actorOrganizationIds.some((id) => normalizeOrganizationId(id) === org);
}

export function filterRowsForOrganization<T extends { organization_id: string }>(
  rows: readonly T[],
  organizationId: string
): T[] {
  const org = normalizeOrganizationId(organizationId);
  if (!org) return [];
  return rows.filter((row) => row.organization_id === org);
}

export function assertNoCrossTenantMutation(input: {
  actorOrganizationIds: readonly string[];
  targetOrganizationId: string;
}): { ok: true } | { ok: false; error: string } {
  if (
    !userCanAccessOrganization(
      input.actorOrganizationIds,
      input.targetOrganizationId
    )
  ) {
    return {
      ok: false,
      error: "Accès refusé: organisation hors périmètre du compte.",
    };
  }
  return { ok: true };
}

/**
 * Deux organisations peuvent partager le même code de catégorie.
 * Une organisation ne peut pas avoir deux fois le même code.
 */
export function wouldDuplicateCategoryCode(input: {
  existing: readonly Pick<CommissionCategoryRow, "organization_id" | "code">[];
  organizationId: string;
  code: string;
}): boolean {
  const org = normalizeOrganizationId(input.organizationId);
  const code = normalizeCategoryCode(input.code);
  if (!org || !code) return false;
  return input.existing.some(
    (row) => row.organization_id === org && row.code === code
  );
}
