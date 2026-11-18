import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CLOCK_SKEW_SECONDS,
  CONTRACT_RUNTIME_WIRED,
  EVENT_TTL_SECONDS,
  HORORA_AUDIENCE,
  HORORA_PIN_ENVIRONMENT,
  HORORA_PRODUCT_NAME,
  HORORA_TECHNICAL_KEY,
  JTI_RETENTION_SECONDS,
  JWKS_FETCH_AUTHORIZED,
  MIGRATION_APPLIED,
  PREPARED_MIGRATION_FILE,
  PROVISIONING_KEY_OVERLAP_SECONDS,
  USER_PROVISIONING_CONTRACT_APPROVAL,
  USER_PROVISIONING_CONTRACT_VERSION,
  accessFromNuserRecognition,
  createHororaZeroAccessCentral,
  type PinnedProvisioningKey,
} from "./zero-access-v1_1";

const ISSUER = "https://nexus.local/horora-v11";
const NUSER = "nuser_ab12cd34ab12cd34ab12cd34ab12cd34";
const OTHER = "nuser_ffffffffffffffffffffffffffffffff";
const TENANT = "tenant_local_v11";
const ORG = "org_local_v11";
const NOW = Date.parse("2026-11-18T15:00:00.000Z");
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const exported = publicKey.export({ format: "jwk" }) as { x: string; y: string };
const key: PinnedProvisioningKey = {
  kty: "EC",
  crv: "P-256",
  alg: "ES256",
  use: "sig",
  kid: "horora-v11-local-test",
  x: exported.x,
  y: exported.y,
  environment: "local",
  status: "active",
};

function central(keys: readonly PinnedProvisioningKey[] = [key]) {
  return createHororaZeroAccessCentral({
    issuer: ISSUER,
    keys,
    allowedScopes: [{ tenantId: TENANT, organizationId: ORG }],
  });
}

function event(patch: Record<string, unknown> = {}) {
  return {
    contract_version: USER_PROVISIONING_CONTRACT_VERSION,
    event_id: "evt_created_0001",
    jti: "jti_created_0001",
    event_type: "identity.created",
    issuer: ISSUER,
    audience: HORORA_AUDIENCE,
    nuser_id: NUSER,
    identity_version: 1,
    occurred_at: "2026-11-18T15:00:00.000Z",
    expires_at: "2026-11-18T15:15:00.000Z",
    correlation_id: "corr_created_0001",
    tenant_context: { tenant_id: TENANT, organization_id: ORG },
    ...patch,
  };
}

function token(
  payload: unknown,
  options?: { kid?: string; alg?: string; extra?: Record<string, unknown>; signer?: KeyObject },
) {
  const header = Buffer.from(
    JSON.stringify({ alg: options?.alg ?? "ES256", kid: options?.kid ?? key.kid, typ: "JWT", ...options?.extra }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign("SHA256", Buffer.from(`${header}.${body}`), {
    key: options?.signer ?? privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${header}.${body}.${signature}`;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...listSourceFiles(full));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("HORORA zero-access identity contract V1.1", () => {
  it("approves V1.1 for tagora:time and stays unwired", () => {
    expect(USER_PROVISIONING_CONTRACT_APPROVAL).toBe("APPROVED");
    expect(USER_PROVISIONING_CONTRACT_VERSION).toBe("V1.1");
    expect(HORORA_AUDIENCE).toBe("tagora:time");
    expect(HORORA_TECHNICAL_KEY).toBe("tagora_time");
    expect(HORORA_PRODUCT_NAME).toBe("TAGORA HORORA");
    expect(HORORA_PIN_ENVIRONMENT).toBe("local");
    expect(EVENT_TTL_SECONDS).toBe(900);
    expect(CLOCK_SKEW_SECONDS).toBe(30);
    expect(PROVISIONING_KEY_OVERLAP_SECONDS).toBe(930);
    expect(CONTRACT_RUNTIME_WIRED).toBe(false);
    expect(MIGRATION_APPLIED).toBe(false);
    expect(JWKS_FETCH_AUTHORIZED).toBe(false);
    expect(accessFromNuserRecognition(NUSER)).toBe(false);
  });

  it("provisions a technical shell with no access, role, admin, org, session, or invitation", () => {
    const store = central();
    const response = store.ingest(token(event()), NOW);
    const snap = store.snapshot(NUSER);
    expect(response.result).toBe("PROVISIONED_ZERO_ACCESS");
    expect(response.effects.identity_created).toBe(true);
    expect(response.effects.module_access).toBe(false);
    expect(response.effects.business_role).toBe("NONE");
    expect(response.effects.module_admin).toBe(false);
    expect(response.effects.business_org_auto_assignment).toBe("NONE");
    expect(response.effects.session_created).toBe(false);
    expect(response.effects.invitation_sent).toBe(false);
    expect(response.effects.permissions_restored).toBe(false);
    expect(response.effects.effective_access_under_module_authority).toBe(false);
    expect(snap?.effectiveAccess).toBe(false);
    expect(snap?.contractGrantedAccess).toBe(false);
    expect(snap?.storedModuleAccess).toBe(false);
    expect(snap?.storedModuleAdmin).toBe(false);
    expect(snap?.storedBusinessRole).toBe("NONE");
    expect(snap?.preexistingOrganizationId).toBeNull();
    expect(snap?.sessionActive).toBe(false);
    expect(snap?.invitationSent).toBe(false);
    expect(snap?.businessOrgAutoAssignment).toBe("NONE");
    expect(store.identityCount()).toBe(1);
    expect(accessFromNuserRecognition(NUSER)).toBe(false);
  });

  it("repeats the same delivery as ALREADY_APPLIED and keeps one identity", () => {
    const store = central();
    const signed = token(event());
    expect(store.ingest(signed, NOW).result).toBe("PROVISIONED_ZERO_ACCESS");
    const subject = store.snapshot(NUSER)?.localSubjectId;
    const repeat = store.ingest(signed, NOW + 60_000);
    expect(repeat.result).toBe("ALREADY_APPLIED");
    expect(repeat.prior_result).toBe("PROVISIONED_ZERO_ACCESS");
    expect(repeat.reason).toBe("DUPLICATE_DELIVERY");
    expect(repeat.effects.session_created).toBe(false);
    expect(store.snapshot(NUSER)?.identityVersion).toBe(1);
    expect(store.snapshot(NUSER)?.localSubjectId).toBe(subject);
    expect(store.identityCount()).toBe(1);
  });

  it("denies a bad signature, a foreign audience, and an unauthorized issuer without a shell", () => {
    const store = central();
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const bad = store.ingest(token(event(), { signer: other.privateKey }), NOW);
    expect(bad.result).toBe("SIGNATURE_DENIED");
    expect(bad.reason).toBe("SIGNATURE_INVALID");
    expect(store.snapshot(NUSER)).toBeNull();
    const audience = store.ingest(
      token(event({ audience: "tagora:stock-premium", event_id: "evt_audience_001", jti: "jti_audience_001" })),
      NOW,
    );
    expect(audience.result).toBe("MODULE_DENIED");
    expect(audience.reason).toBe("AUDIENCE_MISMATCH");
    const directory = store.ingest(
      token(event({ audience: "tagora:time:directory", event_id: "evt_audience_002", jti: "jti_audience_002" })),
      NOW,
    );
    expect(directory.result).toBe("MODULE_DENIED");
    const issuer = store.ingest(
      token(
        event({
          issuer: "https://nexus.local/other-v11",
          event_id: "evt_issuer_00001",
          jti: "jti_issuer_00001",
        }),
      ),
      NOW,
    );
    expect(issuer.result).toBe("SIGNATURE_DENIED");
    expect(issuer.reason).toBe("ISSUER_UNAUTHORIZED");
    expect(store.snapshot(NUSER)).toBeNull();
    expect(store.identityCount()).toBe(0);
  });

  it("pins the kid, refuses other algorithms, and never fetches JWKS", () => {
    const store = central();
    const unknown = store.ingest(token(event(), { kid: "horora-unknown-kid" }), NOW);
    expect(unknown.result).toBe("SIGNATURE_DENIED");
    expect(unknown.reason).toBe("UNKNOWN_KID");
    const hs = store.ingest(
      token(event({ event_id: "evt_alg_hs256_01", jti: "jti_alg_hs256_01" }), { alg: "HS256" }),
      NOW,
    );
    expect(hs.result).toBe("SIGNATURE_DENIED");
    expect(hs.reason).toBe("ALGORITHM_REJECTED");
    const none = store.ingest(
      token(event({ event_id: "evt_alg_none_001", jti: "jti_alg_none_001" }), { alg: "none" }),
      NOW,
    );
    expect(none.result).toBe("SIGNATURE_DENIED");
    expect(none.reason).toBe("ALGORITHM_REJECTED");
    expect(store.snapshot(NUSER)).toBeNull();
    const source = readFileSync(join(REPO_ROOT, "src/app/lib/auth/zero-access-v1_1.ts"), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/undici|jwksUri|createRemoteJWKSet/i);
    expect(source).not.toMatch(/horora-premium-user-central/);
  });

  it("denies a compromised key immediately and a key from another environment", () => {
    const compromised = central([
      {
        ...key,
        status: "compromised",
        retiredAtMs: NOW,
      },
    ]);
    const denied = compromised.ingest(token(event()), NOW);
    expect(denied.result).toBe("SIGNATURE_DENIED");
    expect(denied.reason).toBe("KEY_COMPROMISED");
    expect(compromised.snapshot(NUSER)).toBeNull();

    const staging = central([{ ...key, environment: "staging" }]);
    const foreignEnv = staging.ingest(
      token(event({ event_id: "evt_env_staging_1", jti: "jti_env_staging_1" })),
      NOW,
    );
    expect(foreignEnv.result).toBe("SIGNATURE_DENIED");
    expect(foreignEnv.reason).toBe("KEY_ENVIRONMENT_MISMATCH");
    expect(staging.snapshot(NUSER)).toBeNull();

    const production = central([{ ...key, kid: "horora-v11-prod-test", environment: "production" }]);
    const prod = production.ingest(token(event(), { kid: "horora-v11-prod-test" }), NOW);
    expect(prod.reason).toBe("KEY_ENVIRONMENT_MISMATCH");
    expect(production.identityCount()).toBe(0);
  });

  it("accepts a retired key only inside the 930 second overlap", () => {
    const overlapMs = PROVISIONING_KEY_OVERLAP_SECONDS * 1000;
    const inside = central([{ ...key, status: "retired", retiredAtMs: NOW - overlapMs }]);
    expect(inside.ingest(token(event()), NOW).result).toBe("PROVISIONED_ZERO_ACCESS");

    const outside = central([{ ...key, status: "retired", retiredAtMs: NOW - overlapMs - 1 }]);
    const late = outside.ingest(
      token(event({ event_id: "evt_retired_late1", jti: "jti_retired_late1" })),
      NOW,
    );
    expect(late.result).toBe("SIGNATURE_DENIED");
    expect(late.reason).toBe("KEY_RETIRED");
    expect(outside.snapshot(NUSER)).toBeNull();
  });

  it("applies the 30 second clock skew to key validity and event expiry", () => {
    const notYet = central([{ ...key, notBeforeMs: NOW + 31_000 }]);
    expect(notYet.ingest(token(event()), NOW).reason).toBe("KEY_NOT_YET_VALID");
    const atSkew = central([{ ...key, notBeforeMs: NOW + CLOCK_SKEW_SECONDS * 1000 }]);
    expect(atSkew.ingest(token(event({ event_id: "evt_skew_before_1", jti: "jti_skew_before_1" })), NOW).result).toBe(
      "PROVISIONED_ZERO_ACCESS",
    );

    const expiredKey = central([{ ...key, notAfterMs: NOW - CLOCK_SKEW_SECONDS * 1000 - 1 }]);
    expect(expiredKey.ingest(token(event({ event_id: "evt_skew_after_01", jti: "jti_skew_after_01" })), NOW).reason).toBe(
      "KEY_EXPIRED",
    );
    const keyStillValid = central([{ ...key, notAfterMs: NOW - CLOCK_SKEW_SECONDS * 1000 }]);
    expect(
      keyStillValid.ingest(token(event({ event_id: "evt_skew_after_02", jti: "jti_skew_after_02" })), NOW).result,
    ).toBe("PROVISIONED_ZERO_ACCESS");

    const expiresAt = NOW + EVENT_TTL_SECONDS * 1000;
    const within = central();
    expect(within.ingest(token(event({ event_id: "evt_ttl_within_01", jti: "jti_ttl_within_01" })), expiresAt + CLOCK_SKEW_SECONDS * 1000).result).toBe(
      "PROVISIONED_ZERO_ACCESS",
    );
    const past = central();
    const expired = past.ingest(
      token(event({ event_id: "evt_ttl_past_0001", jti: "jti_ttl_past_0001" })),
      expiresAt + CLOCK_SKEW_SECONDS * 1000 + 1,
    );
    expect(expired.result).toBe("STALE_EVENT_DENIED");
    expect(expired.reason).toBe("EVENT_EXPIRED");
    expect(past.snapshot(NUSER)).toBeNull();
  });

  it("rejects a non-canonical nuser, email, at-sign, PII, and extra fields after a valid signature", () => {
    const store = central();
    const cases = [
      event({ nuser_id: "nuser_AB12CD34AB12CD34AB12CD34AB12CD34", event_id: "evt_nuser_upper01", jti: "jti_nuser_upper01" }),
      event({ nuser_id: "nuser_ab12", event_id: "evt_nuser_short01", jti: "jti_nuser_short01" }),
      event({ email: "person@example.com", event_id: "evt_email_field01", jti: "jti_email_field01" }),
      event({ given_name: "Ada", event_id: "evt_given_name_01", jti: "jti_given_name_01" }),
      event({ note: "person@example.com", event_id: "evt_atsign_note01", jti: "jti_atsign_note01" }),
      event({ nickname: "shell", event_id: "evt_extra_field01", jti: "jti_extra_field01" }),
    ];
    for (const payload of cases) {
      const response = store.ingest(token(payload), NOW);
      expect(response.result).toBe("PAYLOAD_NONCONFORMANT");
      expect(response.reason).toBe("PAYLOAD_NONCONFORMANT");
    }
    expect(store.snapshot(NUSER)).toBeNull();
    expect(store.identityCount()).toBe(0);
    expect(() =>
      store.seedLocalPrincipal({
        localSubjectId: "local_person@example",
        storedBusinessRole: "employe",
        storedModuleAccess: true,
        storedModuleAdmin: false,
        preexistingOrganizationId: ORG,
      }),
    ).toThrow("SYNTHETIC_SEED_REJECTED");
  });

  it("refuses an ambiguous or missing link and does not merge", () => {
    const store = central();
    store.seedLocalPrincipal({
      localSubjectId: "local_existing_one",
      storedBusinessRole: "employe",
      storedModuleAccess: true,
      storedModuleAdmin: false,
      preexistingOrganizationId: ORG,
      businessFilesPresent: true,
    });
    store.seedLocalPrincipal({
      localSubjectId: "local_existing_two",
      storedBusinessRole: "direction",
      storedModuleAccess: true,
      storedModuleAdmin: false,
      preexistingOrganizationId: ORG,
      businessFilesPresent: true,
    });
    const ambiguous = store.ingest(
      token(event({ event_type: "identity.link.requested", event_id: "evt_link_ambig_01", jti: "jti_link_ambig_01" })),
      NOW,
    );
    expect(ambiguous.result).toBe("LINK_REVIEW_REQUIRED");
    expect(ambiguous.reason).toBe("LINK_AMBIGUOUS");
    const missing = central();
    missing.seedLocalPrincipal({
      localSubjectId: "local_existing_one",
      storedBusinessRole: "employe",
      storedModuleAccess: true,
      storedModuleAdmin: false,
      preexistingOrganizationId: ORG,
    });
    const noSubject = missing.ingest(
      token(event({ event_type: "identity.link.requested", event_id: "evt_link_missing1", jti: "jti_link_missing1" })),
      NOW,
    );
    expect(noSubject.result).toBe("LINK_REVIEW_REQUIRED");
    expect(store.snapshot(NUSER)).toBeNull();
    expect(missing.snapshot(NUSER)).toBeNull();
    expect(store.readLocalPrincipal("local_existing_one")?.linkedNuserId).toBeNull();
    expect(store.readLocalPrincipal("local_existing_two")?.linkedNuserId).toBeNull();
    expect(missing.readLocalPrincipal("local_existing_one")?.linkedNuserId).toBeNull();
    expect(store.identityCount()).toBe(0);
  });

  it("links only one verified local subject and keeps the stored role", () => {
    const store = central();
    store.seedLocalPrincipal({
      localSubjectId: "local_existing_one",
      storedBusinessRole: "employe",
      storedModuleAccess: true,
      storedModuleAdmin: false,
      preexistingOrganizationId: ORG,
      businessFilesPresent: true,
      sessionActive: true,
    });
    store.seedLocalPrincipal({
      localSubjectId: "local_existing_two",
      storedBusinessRole: "direction",
      storedModuleAccess: false,
      storedModuleAdmin: false,
      preexistingOrganizationId: ORG,
    });
    const response = store.ingest(
      token(
        event({
          event_type: "identity.link.requested",
          event_id: "evt_link_exact_01",
          jti: "jti_link_exact_01",
          verified_local_subject_id: "local_existing_one",
        }),
      ),
      NOW,
    );
    const snap = store.snapshot(NUSER);
    expect(response.result).toBe("APPLIED");
    expect(response.reason).toBe("LINK_APPLIED");
    expect(response.effects.business_role).toBe("UNCHANGED");
    expect(response.effects.module_access).toBe(false);
    expect(response.effects.module_admin).toBe(false);
    expect(response.effects.session_created).toBe(false);
    expect(response.effects.invitation_sent).toBe(false);
    expect(response.effects.permissions_restored).toBe(false);
    expect(response.effects.business_org_auto_assignment).toBe("NONE");
    expect(snap?.storedBusinessRole).toBe("employe");
    expect(snap?.storedModuleAccess).toBe(true);
    expect(snap?.storedModuleAdmin).toBe(false);
    expect(snap?.businessFilesPresent).toBe(true);
    expect(snap?.preexistingOrganizationId).toBe(ORG);
    expect(snap?.contractGrantedAccess).toBe(false);
    expect(store.readLocalPrincipal("local_existing_two")?.linkedNuserId).toBeNull();
    expect(store.identityCount()).toBe(1);
  });

  it("denies a foreign organization before any link", () => {
    const store = central();
    store.seedLocalPrincipal({
      localSubjectId: "local_existing_one",
      storedBusinessRole: "employe",
      storedModuleAccess: true,
      storedModuleAdmin: false,
      preexistingOrganizationId: ORG,
      businessFilesPresent: true,
    });
    const foreign = store.ingest(
      token(
        event({
          event_type: "identity.link.requested",
          event_id: "evt_link_org_0001",
          jti: "jti_link_org_0001",
          verified_local_subject_id: "local_existing_one",
          tenant_context: { tenant_id: TENANT, organization_id: "org_other_local" },
        }),
      ),
      NOW,
    );
    expect(foreign.result).toBe("TENANT_DENIED");
    expect(foreign.reason).toBe("TENANT_MISMATCH");
    expect(store.snapshot(NUSER)).toBeNull();
    expect(store.readLocalPrincipal("local_existing_one")?.linkedNuserId).toBeNull();
    expect(store.readLocalPrincipal("local_existing_one")?.preexistingOrganizationId).toBe(ORG);
  });

  it("suspends and revokes with an unverified tenant, closes the session, and blocks access", () => {
    const store = central();
    store.seedLocalPrincipal({
      localSubjectId: "local_existing_one",
      linkedNuserId: NUSER,
      storedBusinessRole: "employe",
      storedModuleAccess: true,
      storedModuleAdmin: false,
      preexistingOrganizationId: ORG,
      businessFilesPresent: true,
      sessionActive: true,
    });
    const suspended = store.ingest(
      token(
        event({
          event_type: "identity.suspended",
          event_id: "evt_suspend_0005",
          jti: "jti_suspend_0005",
          identity_version: 5,
          tenant_context: { tenant_id: TENANT, organization_id: "org_other_local" },
        }),
      ),
      NOW,
    );
    expect(suspended.result).toBe("APPLIED");
    expect(suspended.reason).toBe("TENANT_UNVERIFIED_RESTRICTION_APPLIED");
    expect(suspended.effects.sessions_closed).toBe(true);
    expect(suspended.effects.security_block).toBe("SUSPENDED");
    expect(suspended.effects.session_created).toBe(false);
    expect(store.snapshot(NUSER)?.sessionActive).toBe(false);
    expect(store.snapshot(NUSER)?.effectiveAccess).toBe(false);
    expect(store.snapshot(NUSER)?.storedBusinessRole).toBe("employe");
    expect(store.snapshot(NUSER)?.storedModuleAccess).toBe(true);
    expect(store.snapshot(NUSER)?.businessFilesPresent).toBe(true);

    const revokedStore = central();
    revokedStore.seedLocalPrincipal({
      localSubjectId: "local_existing_one",
      linkedNuserId: NUSER,
      storedBusinessRole: "employe",
      storedModuleAccess: true,
      storedModuleAdmin: true,
      preexistingOrganizationId: ORG,
      sessionActive: true,
    });
    const revoked = revokedStore.ingest(
      token(
        event({
          event_type: "identity.revoked",
          event_id: "evt_revoke_0002",
          jti: "jti_revoke_0002",
          identity_version: 2,
          tenant_context: undefined,
        }),
      ),
      NOW,
    );
    expect(revoked.result).toBe("APPLIED");
    expect(revoked.reason).toBe("REVOCATION_APPLIED");
    expect(revoked.effects.sessions_closed).toBe(true);
    expect(revokedStore.snapshot(NUSER)?.securityBlock).toBe("REVOKED");
    expect(revokedStore.snapshot(NUSER)?.latch).toBe("REVOKED_TERMINAL");
    expect(revokedStore.snapshot(NUSER)?.sessionActive).toBe(false);
    expect(revokedStore.snapshot(NUSER)?.effectiveAccess).toBe(false);
    expect(revokedStore.snapshot(NUSER)?.storedModuleAdmin).toBe(true);
  });

  it("keeps revocation terminal and does not restore rights or a session on reactivation", () => {
    const store = central();
    store.seedLocalPrincipal({
      localSubjectId: "local_existing_one",
      linkedNuserId: NUSER,
      storedBusinessRole: "employe",
      storedModuleAccess: true,
      storedModuleAdmin: false,
      preexistingOrganizationId: ORG,
      businessFilesPresent: true,
      sessionActive: true,
    });
    expect(
      store.ingest(
        token(
          event({
            event_type: "identity.suspended",
            event_id: "evt_suspend_0005",
            jti: "jti_suspend_0005",
            identity_version: 5,
            tenant_context: undefined,
          }),
        ),
        NOW,
      ).result,
    ).toBe("APPLIED");
    const stale = store.ingest(
      token(event({ event_type: "identity.updated", event_id: "evt_update_0003", jti: "jti_update_0003", identity_version: 3 })),
      NOW,
    );
    expect(stale.result).toBe("STALE_EVENT_DENIED");
    expect(stale.reason).toBe("VERSION_STALE");
    expect(store.snapshot(NUSER)?.securityBlock).toBe("SUSPENDED");
    const restored = store.ingest(
      token(event({ event_type: "identity.reactivated", event_id: "evt_reactivate_06", jti: "jti_reactivate_06", identity_version: 6 })),
      NOW,
    );
    expect(restored.result).toBe("APPLIED");
    expect(restored.reason).toBe("REACTIVATION_BLOCK_LIFTED");
    expect(restored.effects.permissions_restored).toBe(false);
    expect(restored.effects.session_created).toBe(false);
    expect(restored.effects.module_access).toBe(false);
    expect(store.snapshot(NUSER)?.securityBlock).toBe("NONE");
    expect(store.snapshot(NUSER)?.latch).toBe("RESTORE_REQUIRED");
    expect(store.snapshot(NUSER)?.effectiveAccess).toBe(false);
    expect(store.snapshot(NUSER)?.sessionActive).toBe(false);
    expect(store.snapshot(NUSER)?.storedBusinessRole).toBe("employe");
    expect(store.snapshot(NUSER)?.storedModuleAccess).toBe(true);
    expect(store.snapshot(NUSER)?.storedModuleAdmin).toBe(false);

    const revoked = store.ingest(
      token(
        event({
          event_type: "identity.revoked",
          event_id: "evt_revoke_0007",
          jti: "jti_revoke_0007",
          identity_version: 7,
          tenant_context: undefined,
        }),
      ),
      NOW,
    );
    expect(revoked.result).toBe("APPLIED");
    const replay = store.ingest(
      token(event({ event_type: "identity.reactivated", event_id: "evt_reactivate_08", jti: "jti_reactivate_08", identity_version: 8 })),
      NOW,
    );
    expect(replay.result).toBe("STALE_EVENT_DENIED");
    expect(replay.reason).toBe("REVOCATION_IS_TERMINAL");
    expect(store.snapshot(NUSER)?.latch).toBe("REVOKED_TERMINAL");
    expect(store.snapshot(NUSER)?.securityBlock).toBe("REVOKED");
    expect(store.snapshot(NUSER)?.storedBusinessRole).toBe("employe");
    expect(store.snapshot(NUSER)?.sessionActive).toBe(false);
  });

  it("denies replay, expiry, stale version, and version conflict without a second identity", () => {
    const store = central();
    const expired = store.ingest(token(event()), NOW + 16 * 60 * 1000);
    expect(expired.result).toBe("STALE_EVENT_DENIED");
    expect(expired.reason).toBe("EVENT_EXPIRED");
    expect(store.snapshot(NUSER)).toBeNull();

    const signed = token(event({ event_id: "evt_replay_000001", jti: "jti_replay_000001" }));
    expect(store.ingest(signed, NOW).result).toBe("PROVISIONED_ZERO_ACCESS");
    const replayed = store.ingest(
      token(event({ event_type: "identity.updated", event_id: "evt_replay_000002", jti: "jti_replay_000001", identity_version: 2 })),
      NOW,
    );
    expect(replayed.result).toBe("STALE_EVENT_DENIED");
    expect(replayed.reason).toBe("JTI_REPLAYED");
    expect(store.snapshot(NUSER)?.identityVersion).toBe(1);
    expect(store.identityCount()).toBe(1);

    const conflict = store.ingest(
      token(event({ event_type: "identity.updated", event_id: "evt_conflict_0001", jti: "jti_conflict_0001", identity_version: 1 })),
      NOW,
    );
    expect(conflict.result).toBe("STALE_EVENT_DENIED");
    expect(conflict.reason).toBe("VERSION_CONFLICT");
    expect(store.snapshot(NUSER)?.identityVersion).toBe(1);

    expect(
      store.ingest(
        token(event({ event_type: "identity.updated", event_id: "evt_update_000004", jti: "jti_update_000004", identity_version: 4 })),
        NOW,
      ).result,
    ).toBe("APPLIED");
    const stale = store.ingest(
      token(event({ event_type: "identity.updated", event_id: "evt_update_000002", jti: "jti_update_000002", identity_version: 2 })),
      NOW,
    );
    expect(stale.result).toBe("STALE_EVENT_DENIED");
    expect(stale.reason).toBe("VERSION_STALE");
    expect(store.snapshot(NUSER)?.identityVersion).toBe(4);
    expect(store.identityCount()).toBe(1);

    const late = store.ingest(signed, NOW + (15 * 60 + JTI_RETENTION_SECONDS + 60) * 1000);
    expect(late.result).toBe("STALE_EVENT_DENIED");
    expect(late.reason).toBe("EVENT_EXPIRED");
    expect(store.snapshot(NUSER)?.identityVersion).toBe(4);
  });

  it("returns RETRYABLE_FAILURE and writes nothing while the consumer is unavailable", () => {
    const store = central();
    store.setAvailable(false);
    const before = store.decisionCount();
    const retry = store.ingest(
      token(event({ nuser_id: OTHER, event_id: "evt_retry_000001", jti: "jti_retry_000001", correlation_id: "corr_retry_000001" })),
      NOW,
    );
    expect(retry.result).toBe("RETRYABLE_FAILURE");
    expect(retry.reason).toBe("MODULE_UNAVAILABLE");
    expect(store.snapshot(OTHER)).toBeNull();
    expect(store.identityCount()).toBe(0);
    expect(store.decisionCount()).toBeGreaterThan(before);
    store.setAvailable(true);
    const delivered = store.ingest(
      token(event({ nuser_id: OTHER, event_id: "evt_retry_000001", jti: "jti_retry_000001", correlation_id: "corr_retry_000001" })),
      NOW,
    );
    expect(delivered.result).toBe("PROVISIONED_ZERO_ACCESS");
    expect(store.identityCount()).toBe(1);
    expect(store.snapshot(OTHER)?.effectiveAccess).toBe(false);
    expect(store.snapshot(OTHER)?.sessionActive).toBe(false);
  });

  it("prepares the migration, leaves User Central in authority, and mounts no route", () => {
    const sql = readFileSync(join(REPO_ROOT, PREPARED_MIGRATION_FILE), "utf8");
    expect(sql).toMatch(/Do not apply/);
    expect(sql).toMatch(/NOT_EXECUTED/);
    expect(sql).toMatch(/RAISE EXCEPTION 'NOT_EXECUTED'/);
    expect(sql).toMatch(/horora_identity/);
    expect(sql).toMatch(/revoke all on table horora_identity\.technical_identities from anon/i);
    expect(sql).toMatch(/revoke all on table horora_identity\.technical_identities from authenticated/i);
    expect(sql).not.toMatch(/insert\s+into/i);
    expect(sql.includes("APPLY MIGRATION")).toBe(false);
    expect(MIGRATION_APPLIED).toBe(false);

    const userCentral = readFileSync(join(REPO_ROOT, "src/app/lib/auth/horora-premium-user-central.shared.ts"), "utf8");
    expect(userCentral).toMatch(/reads the RBAC/);
    const consumer = readFileSync(join(REPO_ROOT, "src/app/lib/auth/zero-access-v1_1.ts"), "utf8");
    expect(consumer).not.toMatch(/horora-premium-user-central/);
    expect(consumer).not.toMatch(/\bfetch\s*\(/);
    expect(consumer).not.toMatch(/export async function (GET|POST|PUT|PATCH|DELETE)/);

    const wired = listSourceFiles(join(REPO_ROOT, "src")).filter((file) => {
      const normalized = file.replaceAll("\\", "/");
      if (normalized.endsWith("/src/app/lib/auth/zero-access-v1_1.ts")) return false;
      if (normalized.endsWith("/src/app/lib/auth/zero-access-v1_1.test.ts")) return false;
      return readFileSync(file, "utf8").includes("zero-access-v1_1");
    });
    expect(wired).toEqual([]);
  });
});
