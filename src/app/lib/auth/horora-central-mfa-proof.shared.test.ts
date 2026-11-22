import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NEXUS_HANDOFF_AUDIENCE } from "@/app/lib/auth/nexus-handoff-config";
import {
  HORORA_CENTRAL_MFA_ADR,
  HORORA_CENTRAL_MFA_AAL2_EQUIVALENCE,
  HORORA_CENTRAL_MFA_CONTRACT_ID,
  HORORA_CENTRAL_MFA_DECISION,
  HORORA_CENTRAL_MFA_PROOF_READY,
  HORORA_CENTRAL_MFA_PROOF_SCHEMA_FROZEN,
  HORORA_CENTRAL_MFA_VALIDATION,
  HORORA_PHONE_MFA,
  HORORA_TOTP_PRODUCTION_MIGRATION,
  assessCurrentHororaCentralMfaProof,
  decideHororaCentralMfaProof,
  type HororaCentralMfaProofInput,
} from "@/app/lib/auth/horora-central-mfa-proof.shared";

const NOW = 1_700_000_000;

function futureProof(
  overrides: Partial<HororaCentralMfaProofInput> = {}
): HororaCentralMfaProofInput {
  return {
    proofReady: true,
    schemaFrozen: true,
    signature: "valid",
    algorithm: "ES256",
    subject: "nuser_1",
    expectedSubject: "nuser_1",
    organizationId: "org_1",
    expectedOrganizationId: "org_1",
    localOrganizationMember: true,
    audience: NEXUS_HANDOFF_AUDIENCE,
    authTime: NOW - 10,
    issuedAt: NOW - 10,
    expiresAt: NOW + 50,
    nowSeconds: NOW,
    jti: "jti-1",
    jtiConsumed: false,
    assuranceVerifiedByNexus: true,
    provenance: "verified_token",
    carriesBusinessRoleAuthority: false,
    ...overrides,
  };
}

describe("preuve MFA centrale NEXUS pour HORORA", () => {
  it("enregistre le contrat officiel et maintient le Phone", () => {
    expect(HORORA_CENTRAL_MFA_CONTRACT_ID).toBe("TAGORA-NEXUS-CENTRAL-MFA-V1");
    expect(HORORA_CENTRAL_MFA_ADR).toBe("ADR-0024");
    expect(HORORA_CENTRAL_MFA_DECISION).toBe("DEC-036");
    expect(HORORA_CENTRAL_MFA_VALIDATION).toBe("VALD-114");
    expect(HORORA_CENTRAL_MFA_PROOF_READY).toBe(false);
    expect(HORORA_CENTRAL_MFA_PROOF_SCHEMA_FROZEN).toBe(false);
    expect(HORORA_CENTRAL_MFA_AAL2_EQUIVALENCE).toBe("not_certified");
    expect(HORORA_PHONE_MFA).toBe("active");
    expect(HORORA_TOTP_PRODUCTION_MIGRATION).toBe("suspended");
  });

  it("refuse l'état officiel même si la structure future est complète", () => {
    const { proofReady: _ready, schemaFrozen: _frozen, ...current } = futureProof();
    const decision = assessCurrentHororaCentralMfaProof(current);
    expect(decision).toMatchObject({
      centralProof: "refused",
      access: "refused",
      grantsLocalAal2: false,
      reason: "proof_not_ready",
      phoneMfa: "active",
      totpProductionMigration: "suspended",
    });
  });

  it("accepte une preuve future seulement comme évidence centrale", () => {
    expect(decideHororaCentralMfaProof(futureProof())).toMatchObject({
      centralProof: "verified",
      access: "local_controls_still_required",
      grantsLocalAal2: false,
      aal2Equivalence: "not_certified",
      reason: "central_evidence_only",
    });
  });

  it("refuse une identité, une organisation ou une audience insuffisante", () => {
    expect(decideHororaCentralMfaProof(futureProof({ subject: "" })).reason).toBe(
      "identity_missing"
    );
    expect(
      decideHororaCentralMfaProof(futureProof({ subject: "nuser_autre" })).reason
    ).toBe("identity_mismatch");
    expect(
      decideHororaCentralMfaProof(futureProof({ subject: "martin@tagora.ca" })).reason
    ).toBe("email_identity_forbidden");
    expect(decideHororaCentralMfaProof(futureProof({ organizationId: "" })).reason).toBe(
      "organization_missing"
    );
    expect(
      decideHororaCentralMfaProof(futureProof({ organizationId: "org_autre" })).reason
    ).toBe("organization_mismatch");
    expect(
      decideHororaCentralMfaProof(futureProof({ localOrganizationMember: false })).reason
    ).toBe("local_membership_missing");
    expect(decideHororaCentralMfaProof(futureProof({ audience: "tagora:stock" })).reason).toBe(
      "audience_mismatch"
    );
  });

  it("refuse une signature, une durée, un rejeu ou une assurance insuffisante", () => {
    expect(decideHororaCentralMfaProof(futureProof({ signature: "unchecked" })).reason).toBe(
      "signature_invalid"
    );
    expect(decideHororaCentralMfaProof(futureProof({ algorithm: "RS256" })).reason).toBe(
      "algorithm_rejected"
    );
    expect(decideHororaCentralMfaProof(futureProof({ expiresAt: NOW - 120 })).reason).toBe(
      "expired"
    );
    expect(decideHororaCentralMfaProof(futureProof({ expiresAt: NOW + 200 })).reason).toBe(
      "ttl_exceeded"
    );
    expect(decideHororaCentralMfaProof(futureProof({ authTime: null })).reason).toBe(
      "auth_time_missing"
    );
    expect(decideHororaCentralMfaProof(futureProof({ jtiConsumed: true })).reason).toBe("replay");
    expect(decideHororaCentralMfaProof(futureProof({ jti: " " })).reason).toBe("replay");
    expect(
      decideHororaCentralMfaProof(futureProof({ carriesBusinessRoleAuthority: true })).reason
    ).toBe("business_role_forbidden");
    expect(decideHororaCentralMfaProof(futureProof({ provenance: "browser" })).reason).toBe(
      "browser_declaration_ignored"
    );
    expect(
      decideHororaCentralMfaProof(futureProof({ assuranceVerifiedByNexus: false })).reason
    ).toBe("assurance_not_verified");
  });

  it("reste hors du parcours vivant et hors de Supabase", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/lib/auth/horora-central-mfa-proof.shared.ts"),
      "utf8"
    );
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("unenroll");
    expect(source).not.toContain("AuthGate");
    expect(source).toContain('grantsLocalAal2: false');
  });
});
