import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_METADATA_ROLE_ANNOUNCEMENT_FAILED_MESSAGE,
  HORORA_MEMBERSHIP_ROLE_AUDIT_RPC,
  interpretAuditedRoleCommitRpc,
  recordedRoleSecondarySyncPending,
  simulateAuditedMembershipRoleCommit,
  type SimulatedMembershipStore,
} from "@/app/lib/employee-role-audit-commit.shared";

const root = process.cwd();

function store(role: string | null = "employe"): SimulatedMembershipStore {
  return { role, audits: [] };
}

describe("simulated audited membership role commit", () => {
  it("commits the role and the audit together", () => {
    const membership = store("employe");
    const result = simulateAuditedMembershipRoleCommit({
      refusedCode: null,
      action: "assign",
      role: "direction",
      previousMembershipRole: "employe",
      store: membership,
      failAt: "none",
    });
    expect(result).toMatchObject({
      ok: true,
      role: "direction",
      audited: true,
      unchanged: false,
    });
    expect(membership).toEqual({
      role: "direction",
      audits: [{ oldRole: "employe", newRole: "direction" }],
    });
  });

  it("leaves the role unchanged when the audit fails", () => {
    const membership = store("employe");
    const result = simulateAuditedMembershipRoleCommit({
      refusedCode: null,
      action: "assign",
      role: "direction",
      previousMembershipRole: "employe",
      store: membership,
      failAt: "audit",
    });
    expect(result).toMatchObject({
      ok: false,
      code: "audit_write_failed",
      audited: false,
      announced: false,
      membershipCommitted: false,
    });
    expect(membership).toEqual({ role: "employe", audits: [] });
  });

  it("writes nothing when the membership write fails", () => {
    const membership = store("direction");
    const result = simulateAuditedMembershipRoleCommit({
      refusedCode: null,
      action: "assign",
      role: "employe",
      previousMembershipRole: "direction",
      store: membership,
      failAt: "membership",
    });
    expect(result).toMatchObject({
      ok: false,
      code: "membership_role_write_failed",
      audited: false,
      announced: false,
      membershipCommitted: false,
    });
    expect(membership).toEqual({ role: "direction", audits: [] });
  });

  it("writes nothing for a refused actor, self change, protected account or other organization", () => {
    for (const code of [
      "actor_forbidden",
      "self_role_change_forbidden",
      "protected_account_forbidden",
      "direction_assignment_unauthorized",
      "cross_tenant_conflict",
      "session_unreliable",
    ]) {
      const membership = store("employe");
      const result = simulateAuditedMembershipRoleCommit({
        refusedCode: code,
        action: "assign",
        role: "direction",
        previousMembershipRole: "employe",
        store: membership,
        failAt: "none",
      });
      expect(result).toMatchObject({
        ok: false,
        code,
        audited: false,
        announced: false,
        membershipCommitted: false,
      });
      expect(membership).toEqual({ role: "employe", audits: [] });
    }
  });

  it("does not treat an unchanged role as a new audited change", () => {
    const membership = store("direction");
    const result = simulateAuditedMembershipRoleCommit({
      refusedCode: null,
      action: "noop",
      role: "direction",
      previousMembershipRole: "direction",
      store: membership,
      failAt: "none",
    });
    expect(result).toEqual({
      ok: true,
      role: "direction",
      audited: false,
      unchanged: true,
    });
    expect(membership.audits).toEqual([]);
  });
});

describe("secondary app_metadata sync", () => {
  it("keeps a recorded audited role distinct from a cancelled change", () => {
    expect(recordedRoleSecondarySyncPending("direction")).toEqual({
      success: false,
      code: "app_metadata_role_announcement_failed",
      error: APP_METADATA_ROLE_ANNOUNCEMENT_FAILED_MESSAGE,
      message: APP_METADATA_ROLE_ANNOUNCEMENT_FAILED_MESSAGE,
      authoritativeRole: "direction",
      role: "direction",
      rolePersisted: true,
      audited: true,
      secondarySync: "pending",
    });
    expect(APP_METADATA_ROLE_ANNOUNCEMENT_FAILED_MESSAGE).toBe(
      "Role enregistre et audite. Synchronisation secondaire en attente."
    );
    expect(
      interpretAuditedRoleCommitRpc({
        errorMessage: "membership_role_write_failed",
        data: null,
        expectedRole: "direction",
      })
    ).toMatchObject({
      ok: false,
      membershipCommitted: false,
      announced: false,
    });
  });
});

describe("single RPC result", () => {
  it("accepts a completed audited change and rejects an audit or membership error", () => {
    expect(
      interpretAuditedRoleCommitRpc({
        errorMessage: null,
        data: { ok: true, role: "direction", audited: true, action: "assign" },
        expectedRole: "direction",
      })
    ).toMatchObject({ ok: true, audited: true, unchanged: false });

    expect(
      interpretAuditedRoleCommitRpc({
        errorMessage: "audit_write_failed",
        data: null,
        expectedRole: "direction",
      })
    ).toMatchObject({
      ok: false,
      code: "audit_write_failed",
      membershipCommitted: false,
      announced: false,
    });

    expect(
      interpretAuditedRoleCommitRpc({
        errorMessage: "membership_role_write_failed",
        data: { ok: true, role: "direction", audited: true, action: "assign" },
        expectedRole: "direction",
      })
    ).toMatchObject({ ok: false, membershipCommitted: false, announced: false });
  });

  it("stays closed when the function is missing or the payload is incomplete", () => {
    expect(
      interpretAuditedRoleCommitRpc({
        errorMessage: "Could not find the function public.commit_horora_membership_role_with_audit in the schema cache",
        data: null,
        expectedRole: "employe",
      })
    ).toMatchObject({
      ok: false,
      code: "audited_role_commit_unavailable",
      membershipCommitted: false,
      announced: false,
    });

    expect(
      interpretAuditedRoleCommitRpc({
        errorMessage: null,
        data: { ok: true, role: "direction", audited: false, action: "assign" },
        expectedRole: "direction",
      })
    ).toMatchObject({ ok: false, code: "audit_write_failed", membershipCommitted: false });
  });
});

describe("unapplied SQL proposal", () => {
  const sql = readFileSync(
    join(root, "supabase/migrations/20261010223000_commit_horora_membership_role_with_audit.sql"),
    "utf8"
  );
  const membershipWrite = sql.search(/insert into public\.organization_memberships|update public\.organization_memberships/);
  const auditWrite = sql.indexOf("insert into public.user_role_audit_logs");

  it("checks the actor, target, organization and protected roles before any role write", () => {
    expect(sql).toContain("LOCAL PROPOSAL ONLY");
    expect(sql).toContain("DO NOT APPLY");
    expect(sql).toContain(HORORA_MEMBERSHIP_ROLE_AUDIT_RPC);
    for (const code of [
      "session_unreliable",
      "unauthorized_membership_role",
      "self_role_change_forbidden",
      "actor_forbidden",
      "cross_tenant_conflict",
      "protected_account_forbidden",
      "direction_assignment_unauthorized",
      "target_missing",
    ]) {
      expect(sql.indexOf(code)).toBeGreaterThan(-1);
      expect(sql.indexOf(code)).toBeLessThan(membershipWrite);
    }
    expect(sql.indexOf("membership_role_write_failed")).toBeGreaterThan(membershipWrite);
    expect(sql.indexOf("membership_role_write_failed")).toBeLessThan(auditWrite);
    expect(sql).toContain("organization_owner");
    expect(sql).toContain("organization_admin");
    expect(sql).not.toMatch(/exception\s+when/i);
    expect(sql).not.toMatch(/^\s*commit\s*;/im);
  });

  it("writes the audit in the same function as the membership role", () => {
    expect(membershipWrite).toBeGreaterThan(-1);
    expect(auditWrite).toBeGreaterThan(membershipWrite);
    expect(sql.indexOf("'audited', true")).toBeGreaterThan(auditWrite);
    expect(sql).toContain("revoke all on function");
    expect(sql).toContain("from public");
    expect(sql).toContain("from anon");
    expect(sql).toContain("from authenticated");
    expect(sql).toContain("grant execute on function");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("security invoker");
  });
});

describe("audited routes call the function before app_metadata", () => {
  it("does not insert the audit after the employee selector writes the role", () => {
    const route = readFileSync(
      join(root, "src/app/api/direction/ressources/employes/[id]/invite-account/route.ts"),
      "utf8"
    );
    const updateAt = route.indexOf('action === "update_portal_access"');
    const disableAt = route.indexOf('action === "disable_access"');
    const block = route.slice(updateAt, disableAt);
    expect(block.indexOf("commitAuditedOrganizationRole")).toBeGreaterThan(-1);
    expect(block.indexOf("commitAuditedOrganizationRole")).toBeLessThan(block.indexOf("updateUserById"));
    expect(block).not.toContain("user_role_audit_logs");
    expect(block).toContain("recordedRoleSecondarySyncPending");
    expect(block).toContain("rolePersisted: false");
  });

  it("does not insert the audit after the admin panel writes the role", () => {
    const route = readFileSync(
      join(root, "src/app/api/admin/employes/[employeeId]/portal-account/route.ts"),
      "utf8"
    );
    const patch = route.slice(route.indexOf("export async function PATCH"));
    expect(patch.indexOf("commitAuditedOrganizationRole")).toBeLessThan(patch.indexOf("updateUserById"));
    expect(patch).not.toContain("user_role_audit_logs");
    expect(patch).toContain("recordedRoleSecondarySyncPending");
    expect(patch).toContain("rolePersisted: false");
  });

  it("keeps the server writer on the single RPC", () => {
    const server = readFileSync(
      join(root, "src/app/lib/employee-onboarding-tenant.server.ts"),
      "utf8"
    );
    const fn = server.slice(
      server.indexOf("export async function commitAuditedOrganizationRole"),
      server.indexOf("export async function completeEmployeeTenantAccess")
    );
    expect(fn).toContain(`.rpc(${"HORORA_MEMBERSHIP_ROLE_AUDIT_RPC"}`);
    expect(fn).toContain("interpretAuditedRoleCommitRpc");
    expect(fn).not.toContain('from("organization_memberships")');
    expect(fn).not.toContain("user_role_audit_logs");
    expect(fn).not.toContain("updateUserById");
  });

  it("shows a pending secondary sync without treating the recorded role as cancelled", () => {
    const fiche = readFileSync(
      join(root, "src/app/direction/ressources/employes/EmployeePortalAccessSection.tsx"),
      "utf8"
    );
    const admin = readFileSync(
      join(root, "src/app/direction/ressources/employes/EmployeeProfilePageClient.tsx"),
      "utf8"
    );
    expect(fiche).toContain("rolePersisted === true");
    expect(fiche).toContain('type: "pending"');
    expect(fiche).toContain("APP_METADATA_ROLE_ANNOUNCEMENT_FAILED_MESSAGE");
    expect(admin).toContain("rolePersisted === true");
    expect(admin).toContain("APP_METADATA_ROLE_ANNOUNCEMENT_FAILED_MESSAGE");
    expect(admin.indexOf("rolePersisted === true")).toBeLessThan(
      admin.indexOf("Modification de role refusee.")
    );
  });
});
