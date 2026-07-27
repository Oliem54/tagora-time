/**
 * Bloc 6C — Origine commerciale client/revendeur, résolution, snapshot, transferts.
 *
 * Couche pure. Aucune I/O, UI, ni branchement moteur.
 *
 * Flux obligatoire :
 * fiche (profil) → copie historique sur la vente (snapshot) → calcul futur.
 * Un changement de fiche ne modifie jamais un snapshot passé.
 *
 * organization_id : convention officielle (voir commission-catalog.shared).
 */

import {
  CLIENT_COMMERCIAL_ORIGIN_V1_VISIBLE,
  normalizeClientCommercialOrigin,
  resolveClientOriginForV1Plan,
  type ClientCommercialOrigin,
} from "@/app/lib/commissions/commission-plan.shared";
import { normalizeOrganizationId } from "@/app/lib/commissions/commission-catalog.shared";

export type CommercialPartyType = "client" | "reseller";

export type CommercialOriginProfileStatus =
  | "active"
  | "transferred"
  | "inactive";

/** File « À vérifier » = pending_review (pas de table dédiée). */
export type OriginSnapshotReviewStatus =
  | "confirmed"
  | "pending_review"
  | "resolved"
  | "invalid";

export type CommercialOriginResolutionStatus =
  | "resolved"
  | "pending_review"
  | "invalid";

export type CommercialParty = {
  id: string;
  organization_id: string;
  party_type: CommercialPartyType;
  /** Affichage seulement — jamais clé métier. */
  label: string;
  external_key: string | null;
};

export type CommercialOriginProfile = {
  id: string;
  organization_id: string;
  entity_type: CommercialPartyType;
  entity_id: string;
  commercial_origin: ClientCommercialOrigin;
  developed_by_employee_id: number | null;
  effective_from: string;
  effective_to: string | null;
  status: CommercialOriginProfileStatus;
};

export type CommercialOriginTransfer = {
  id: string;
  organization_id: string;
  entity_type: CommercialPartyType;
  entity_id: string;
  from_employee_id: number;
  to_employee_id: number;
  /** Date effective (YYYY-MM-DD). Ventes avec sale_date >= effective_at. */
  effective_at: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type SaleCommercialOriginSnapshot = {
  id?: string;
  organization_id: string;
  sale_id: string;
  commercial_origin_snapshot: ClientCommercialOrigin | null;
  developed_by_employee_id_snapshot: number | null;
  source_profile_id: string | null;
  captured_at: string;
  captured_by_system: boolean;
  captured_by: string | null;
  review_status: OriginSnapshotReviewStatus;
  confirmed_by: string | null;
  confirmed_at: string | null;
  confirmation_reason: string | null;
};

export type ResolveCommercialOriginInput = {
  organization_id: string;
  entity_type: CommercialPartyType;
  entity_id: string;
  /** Date de la vente (YYYY-MM-DD). */
  sale_date: string;
  profile: CommercialOriginProfile | null;
  transfers: readonly CommercialOriginTransfer[];
};

export type ResolveCommercialOriginResult = {
  commercial_origin: ClientCommercialOrigin | null;
  /** Valeur pour moteur futur: company_developed → existing; null si pending. */
  origin_effective_for_engine: "existing" | "employee_developed" | null;
  developed_by_employee_id: number | null;
  resolution_status: CommercialOriginResolutionStatus;
  source: "profile" | "transfer" | "none";
  requires_review: boolean;
  source_profile_id: string | null;
};

export const ORIGIN_PENDING_REVIEW_LABEL =
  "Origine du client à confirmer" as const;

export function isCommercialOriginVisibleInSimpleWizard(
  origin: ClientCommercialOrigin
): boolean {
  return (CLIENT_COMMERCIAL_ORIGIN_V1_VISIBLE as readonly string[]).includes(
    origin
  );
}

export function normalizeCommercialPartyType(
  value: unknown
): CommercialPartyType | null {
  if (value === "client" || value === "reseller") return value;
  return null;
}

export type CommercialOriginActorRole = "admin" | "direction" | "employe";

export function validateCommercialOriginProfileInput(input: {
  organization_id: unknown;
  entity_type: unknown;
  entity_id: unknown;
  commercial_origin: unknown;
  developed_by_employee_id: unknown;
  effective_from: unknown;
  effective_to?: unknown;
  /**
   * Rôle de l’acteur qui crée/modifie l’attribution.
   * Un Employé ne peut jamais muter un profil (anti auto-attribution).
   * Admin/Direction peuvent désigner n’importe quel employé développeur
   * (y compris celui qui correspond à une fiche employé) — c’est l’action
   * non autorisée qui est bloquée, pas l’identité du développeur.
   */
  actor_role?: CommercialOriginActorRole | null;
}): { ok: true } | { ok: false; error: string } {
  if (input.actor_role === "employe") {
    return {
      ok: false,
      error:
        "Un employé ne peut pas créer ou modifier l’attribution commerciale d’un client.",
    };
  }

  if (!normalizeOrganizationId(input.organization_id)) {
    return {
      ok: false,
      error: "Identifiant d’organisation invalide.",
    };
  }
  if (!normalizeCommercialPartyType(input.entity_type)) {
    return { ok: false, error: "Type de partie invalide (client ou revendeur)." };
  }
  if (typeof input.entity_id !== "string" || input.entity_id.trim() === "") {
    return { ok: false, error: "Identifiant de partie requis." };
  }
  const origin = normalizeClientCommercialOrigin(input.commercial_origin);
  if (!origin) {
    return { ok: false, error: "Origine commerciale invalide." };
  }

  const developer =
    input.developed_by_employee_id == null ||
    input.developed_by_employee_id === ""
      ? null
      : Number(input.developed_by_employee_id);

  if (
    developer != null &&
    (!Number.isInteger(developer) || developer <= 0)
  ) {
    return { ok: false, error: "Employé développeur invalide." };
  }

  if (origin === "employee_developed" && developer == null) {
    return {
      ok: false,
      error: "Un employé développeur est obligatoire pour un client développé.",
    };
  }

  if (typeof input.effective_from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.effective_from)) {
    return { ok: false, error: "Date d’effet invalide." };
  }
  if (
    input.effective_to != null &&
    input.effective_to !== "" &&
    (typeof input.effective_to !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.effective_to) ||
      input.effective_to < input.effective_from)
  ) {
    return { ok: false, error: "Période d’effet incohérente." };
  }

  return { ok: true };
}

export function validateCommercialOriginTransferInput(input: {
  organization_id: unknown;
  entity_type: unknown;
  entity_id: unknown;
  from_employee_id: unknown;
  to_employee_id: unknown;
  effective_at: unknown;
}): { ok: true } | { ok: false; error: string } {
  if (!normalizeOrganizationId(input.organization_id)) {
    return { ok: false, error: "Identifiant d’organisation invalide." };
  }
  if (!normalizeCommercialPartyType(input.entity_type)) {
    return { ok: false, error: "Type de partie invalide." };
  }
  if (typeof input.entity_id !== "string" || input.entity_id.trim() === "") {
    return { ok: false, error: "Identifiant de partie requis." };
  }
  const fromId = Number(input.from_employee_id);
  const toId = Number(input.to_employee_id);
  if (!Number.isInteger(fromId) || fromId <= 0) {
    return { ok: false, error: "Ancien employé développeur invalide." };
  }
  if (!Number.isInteger(toId) || toId <= 0) {
    return { ok: false, error: "Nouvel employé développeur invalide." };
  }
  if (fromId === toId) {
    return {
      ok: false,
      error: "Le nouvel employé doit être différent de l’ancien.",
    };
  }
  if (
    typeof input.effective_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.effective_at)
  ) {
    return { ok: false, error: "Date effective de transfert obligatoire." };
  }
  return { ok: true };
}

export function assertSameOrganization(input: {
  actorOrganizationIds: readonly string[];
  targetOrganizationId: string;
}): { ok: true } | { ok: false; error: string } {
  const org = normalizeOrganizationId(input.targetOrganizationId);
  if (!org) {
    return { ok: false, error: "Identifiant d’organisation invalide." };
  }
  const allowed = input.actorOrganizationIds
    .map((id) => normalizeOrganizationId(id))
    .filter((id): id is string => Boolean(id));
  if (!allowed.includes(org)) {
    return {
      ok: false,
      error: "Accès refusé: organisation hors périmètre du compte.",
    };
  }
  return { ok: true };
}

/**
 * Transfert applicable à une vente: effective_at <= sale_date.
 * Le plus récent gagne. Transfert après la vente: ignoré (snapshot passé intact).
 */
export function findApplicableTransfer(
  transfers: readonly CommercialOriginTransfer[],
  organizationId: string,
  entityType: CommercialPartyType,
  entityId: string,
  saleDate: string
): CommercialOriginTransfer | null {
  const org = normalizeOrganizationId(organizationId);
  if (!org) return null;

  const applicable = transfers
    .filter(
      (t) =>
        normalizeOrganizationId(t.organization_id) === org &&
        t.entity_type === entityType &&
        t.entity_id === entityId &&
        t.effective_at <= saleDate
    )
    .sort((a, b) => {
      if (a.effective_at === b.effective_at) {
        return a.created_at < b.created_at ? 1 : -1;
      }
      return a.effective_at < b.effective_at ? 1 : -1;
    });

  return applicable[0] ?? null;
}

/**
 * Résout l’origine pour une vente à une date donnée.
 * Ne choisit jamais « existing » silencieusement en cas d’ambiguïté.
 */
export function resolveCommercialOriginForSale(
  input: ResolveCommercialOriginInput
): ResolveCommercialOriginResult {
  const org = normalizeOrganizationId(input.organization_id);
  const pending = (): ResolveCommercialOriginResult => ({
    commercial_origin: null,
    origin_effective_for_engine: null,
    developed_by_employee_id: null,
    resolution_status: "pending_review",
    source: "none",
    requires_review: true,
    source_profile_id: null,
  });

  if (!org || !/^\d{4}-\d{2}-\d{2}$/.test(input.sale_date)) {
    return { ...pending(), resolution_status: "invalid" };
  }

  const profile = input.profile;
  if (
    !profile ||
    normalizeOrganizationId(profile.organization_id) !== org ||
    profile.entity_type !== input.entity_type ||
    profile.entity_id !== input.entity_id
  ) {
    return pending();
  }

  if (
    profile.effective_from > input.sale_date ||
    (profile.effective_to != null && profile.effective_to < input.sale_date)
  ) {
    return pending();
  }

  const origin = normalizeClientCommercialOrigin(profile.commercial_origin);
  if (!origin) {
    return pending();
  }

  let developedBy = profile.developed_by_employee_id;
  let source: ResolveCommercialOriginResult["source"] = "profile";

  const transfer = findApplicableTransfer(
    input.transfers,
    org,
    input.entity_type,
    input.entity_id,
    input.sale_date
  );

  if (transfer && origin === "employee_developed") {
    developedBy = transfer.to_employee_id;
    source = "transfer";
  }

  if (origin === "employee_developed" && developedBy == null) {
    return {
      ...pending(),
      source_profile_id: profile.id,
      source: "profile",
    };
  }

  const originEffective =
    origin === "company_developed"
      ? resolveClientOriginForV1Plan(origin)
      : origin === "employee_developed"
        ? "employee_developed"
        : "existing";

  return {
    commercial_origin: origin,
    origin_effective_for_engine: originEffective,
    developed_by_employee_id:
      origin === "employee_developed" ? developedBy : null,
    resolution_status: "resolved",
    source,
    requires_review: false,
    source_profile_id: profile.id,
  };
}

/**
 * Construit le snapshot à capturer sur la vente.
 * Ne copie jamais depuis un profil « live » après coup — uniquement depuis la résolution.
 */
export function buildSaleOriginSnapshot(input: {
  organization_id: string;
  sale_id: string;
  resolution: ResolveCommercialOriginResult;
  captured_at: string;
  captured_by?: string | null;
}): SaleCommercialOriginSnapshot | null {
  const org = normalizeOrganizationId(input.organization_id);
  if (!org || typeof input.sale_id !== "string" || input.sale_id.trim() === "") {
    return null;
  }

  if (input.resolution.requires_review) {
    return {
      organization_id: org,
      sale_id: input.sale_id.trim(),
      commercial_origin_snapshot: null,
      developed_by_employee_id_snapshot: null,
      source_profile_id: input.resolution.source_profile_id,
      captured_at: input.captured_at,
      captured_by_system: true,
      captured_by: input.captured_by ?? null,
      review_status: "pending_review",
      confirmed_by: null,
      confirmed_at: null,
      confirmation_reason: null,
    };
  }

  return {
    organization_id: org,
    sale_id: input.sale_id.trim(),
    commercial_origin_snapshot: input.resolution.commercial_origin,
    developed_by_employee_id_snapshot:
      input.resolution.developed_by_employee_id,
    source_profile_id: input.resolution.source_profile_id,
    captured_at: input.captured_at,
    captured_by_system: true,
    captured_by: input.captured_by ?? null,
    review_status: "confirmed",
    confirmed_by: null,
    confirmed_at: null,
    confirmation_reason: null,
  };
}

/**
 * Un snapshot déjà capturé n’est pas modifié par un changement de profil.
 * (garde pure pour les tests / appels métier)
 */
export function applyProfileChangeToSnapshot(
  snapshot: SaleCommercialOriginSnapshot,
  _newProfile: CommercialOriginProfile
): SaleCommercialOriginSnapshot {
  void _newProfile;
  return snapshot;
}

export function isSnapshotUsableForFutureCalculation(
  snapshot: Pick<
    SaleCommercialOriginSnapshot,
    "review_status" | "commercial_origin_snapshot"
  >
): boolean {
  if (
    snapshot.review_status === "pending_review" ||
    snapshot.review_status === "invalid"
  ) {
    return false;
  }
  return snapshot.commercial_origin_snapshot != null;
}
