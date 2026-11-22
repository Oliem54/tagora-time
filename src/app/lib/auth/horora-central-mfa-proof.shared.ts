/**
 * Contrôle serveur HORORA pour la future preuve MFA centrale NEXUS.
 * TAGORA-NEXUS-CENTRAL-MFA-V1, ADR-0024, DEC-036, VALD-114.
 *
 * NEXUS reste l'autorité du MFA Entra. Ce module ne crée pas de facteur,
 * n'écrit rien et ne transforme pas une preuve centrale en AAL2 Supabase.
 * Le schéma des claims reste ouvert : une preuve structurellement complète
 * est une évidence centrale, pas un accès et pas un AAL2.
 */

import {
  NEXUS_HANDOFF_ALGORITHM,
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_CLOCK_SKEW_SECONDS,
  NEXUS_HANDOFF_MAX_TTL_SECONDS,
} from "@/app/lib/auth/nexus-handoff-config";

export const HORORA_CENTRAL_MFA_CONTRACT_ID = "TAGORA-NEXUS-CENTRAL-MFA-V1" as const;
export const HORORA_CENTRAL_MFA_ADR = "ADR-0024" as const;
export const HORORA_CENTRAL_MFA_DECISION = "DEC-036" as const;
export const HORORA_CENTRAL_MFA_VALIDATION = "VALD-114" as const;

/** Lecture officielle actuelle. Un GO ultérieur seul peut les passer à vrai. */
export const HORORA_CENTRAL_MFA_PROOF_READY = false;
export const HORORA_CENTRAL_MFA_PROOF_SCHEMA_FROZEN = false;
export const HORORA_CENTRAL_MFA_AAL2_EQUIVALENCE = "not_certified" as const;
export const HORORA_PHONE_MFA = "active" as const;
export const HORORA_TOTP_PRODUCTION_MIGRATION = "suspended" as const;

export const HORORA_CENTRAL_MFA_MAX_TTL_SECONDS = NEXUS_HANDOFF_MAX_TTL_SECONDS;
export const HORORA_CENTRAL_MFA_AUDIENCE = NEXUS_HANDOFF_AUDIENCE;

export type HororaCentralMfaProvenance = "verified_token" | "browser" | "absent";

export type HororaCentralMfaProofInput = {
  readonly proofReady: boolean;
  readonly schemaFrozen: boolean;
  readonly signature: "valid" | "invalid" | "unchecked";
  readonly algorithm: string;
  readonly subject: string;
  readonly expectedSubject: string;
  readonly organizationId: string;
  readonly expectedOrganizationId: string;
  readonly localOrganizationMember: boolean;
  readonly audience: string;
  readonly authTime: number | null;
  readonly issuedAt: number | null;
  readonly expiresAt: number | null;
  readonly nowSeconds: number;
  readonly jti: string;
  readonly jtiConsumed: boolean;
  readonly assuranceVerifiedByNexus: boolean;
  readonly provenance: HororaCentralMfaProvenance;
  readonly carriesBusinessRoleAuthority: boolean;
};

export type HororaCentralMfaRefuseReason =
  | "proof_not_ready"
  | "schema_not_frozen"
  | "identity_missing"
  | "identity_mismatch"
  | "email_identity_forbidden"
  | "organization_missing"
  | "organization_mismatch"
  | "local_membership_missing"
  | "audience_mismatch"
  | "signature_invalid"
  | "algorithm_rejected"
  | "expired"
  | "ttl_exceeded"
  | "auth_time_missing"
  | "replay"
  | "assurance_not_verified"
  | "browser_declaration_ignored"
  | "business_role_forbidden";

export type HororaCentralMfaDecision = {
  readonly contractId: typeof HORORA_CENTRAL_MFA_CONTRACT_ID;
  readonly centralProof: "verified" | "refused";
  readonly access: "refused" | "local_controls_still_required";
  readonly grantsLocalAal2: false;
  readonly aal2Equivalence: typeof HORORA_CENTRAL_MFA_AAL2_EQUIVALENCE;
  readonly phoneMfa: typeof HORORA_PHONE_MFA;
  readonly totpProductionMigration: typeof HORORA_TOTP_PRODUCTION_MIGRATION;
  readonly reason: HororaCentralMfaRefuseReason | "central_evidence_only";
};

function refuse(reason: HororaCentralMfaRefuseReason): HororaCentralMfaDecision {
  return {
    contractId: HORORA_CENTRAL_MFA_CONTRACT_ID,
    centralProof: "refused",
    access: "refused",
    grantsLocalAal2: false,
    aal2Equivalence: HORORA_CENTRAL_MFA_AAL2_EQUIVALENCE,
    phoneMfa: HORORA_PHONE_MFA,
    totpProductionMigration: HORORA_TOTP_PRODUCTION_MIGRATION,
    reason,
  };
}

function isFiniteEpoch(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Vérifie les exigences déjà fixées par le contrat.
 * Les noms de claims Entra ne sont pas lus ici : ils ne sont pas figés.
 */
export function decideHororaCentralMfaProof(
  input: HororaCentralMfaProofInput
): HororaCentralMfaDecision {
  if (!input.proofReady) return refuse("proof_not_ready");
  if (!input.schemaFrozen) return refuse("schema_not_frozen");

  const subject = input.subject.trim();
  const expectedSubject = input.expectedSubject.trim();
  if (!subject || !expectedSubject) return refuse("identity_missing");
  if (subject.includes("@") || expectedSubject.includes("@")) {
    return refuse("email_identity_forbidden");
  }
  if (subject !== expectedSubject) return refuse("identity_mismatch");

  const organizationId = input.organizationId.trim();
  const expectedOrganizationId = input.expectedOrganizationId.trim();
  if (!organizationId || !expectedOrganizationId) return refuse("organization_missing");
  if (organizationId !== expectedOrganizationId) return refuse("organization_mismatch");
  if (!input.localOrganizationMember) return refuse("local_membership_missing");

  if (input.audience.trim() !== HORORA_CENTRAL_MFA_AUDIENCE) {
    return refuse("audience_mismatch");
  }

  if (input.signature !== "valid") return refuse("signature_invalid");
  if (input.algorithm.trim() !== NEXUS_HANDOFF_ALGORITHM) return refuse("algorithm_rejected");

  if (
    !isFiniteEpoch(input.issuedAt) ||
    !isFiniteEpoch(input.expiresAt) ||
    !isFiniteEpoch(input.nowSeconds)
  ) {
    return refuse("expired");
  }
  if (input.expiresAt + NEXUS_HANDOFF_CLOCK_SKEW_SECONDS < input.nowSeconds) {
    return refuse("expired");
  }
  if (input.expiresAt - input.issuedAt > HORORA_CENTRAL_MFA_MAX_TTL_SECONDS) {
    return refuse("ttl_exceeded");
  }
  if (
    !isFiniteEpoch(input.authTime) ||
    input.authTime > input.nowSeconds + NEXUS_HANDOFF_CLOCK_SKEW_SECONDS
  ) {
    return refuse("auth_time_missing");
  }

  if (!input.jti.trim() || input.jtiConsumed) return refuse("replay");

  if (input.carriesBusinessRoleAuthority) return refuse("business_role_forbidden");
  if (input.provenance !== "verified_token") return refuse("browser_declaration_ignored");
  if (!input.assuranceVerifiedByNexus) return refuse("assurance_not_verified");

  return {
    contractId: HORORA_CENTRAL_MFA_CONTRACT_ID,
    centralProof: "verified",
    access: "local_controls_still_required",
    grantsLocalAal2: false,
    aal2Equivalence: HORORA_CENTRAL_MFA_AAL2_EQUIVALENCE,
    phoneMfa: HORORA_PHONE_MFA,
    totpProductionMigration: HORORA_TOTP_PRODUCTION_MIGRATION,
    reason: "central_evidence_only",
  };
}

/** État officiel actuel : la preuve NEXUS n'est pas prête, donc l'accès central est refusé. */
export function assessCurrentHororaCentralMfaProof(
  input: Omit<HororaCentralMfaProofInput, "proofReady" | "schemaFrozen">
): HororaCentralMfaDecision {
  return decideHororaCentralMfaProof({
    ...input,
    proofReady: HORORA_CENTRAL_MFA_PROOF_READY,
    schemaFrozen: HORORA_CENTRAL_MFA_PROOF_SCHEMA_FROZEN,
  });
}
