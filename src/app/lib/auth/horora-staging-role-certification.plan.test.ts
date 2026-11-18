import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HORORA_ISOLATED_PREVIEW_CANDIDATE,
  HORORA_ROLE_WRITER_ISOLATED_DELIVERY,
  HORORA_ROLE_WRITER_STAGING_PREFLIGHT,
  HORORA_STAGING_ROLE_CERTIFICATION_PLAN,
  HORORA_STAGING_ROLE_RPC_ARGS,
  assertStagingRoleCertificationStaysUnexecuted,
} from "@/app/lib/auth/horora-staging-role-certification.plan";

describe("HORORA staging role certification plan", () => {
  it("keeps the assignment unexecuted and limited to employe or direction", () => {
    assertStagingRoleCertificationStaysUnexecuted();
    expect(HORORA_STAGING_ROLE_CERTIFICATION_PLAN).toMatchObject({
      projectId: "qokyobcvplzufshydhih",
      rpc: "commit_horora_membership_role_with_audit",
      execute: false,
      requiresDistinctGo: true,
    });
    expect(HORORA_STAGING_ROLE_CERTIFICATION_PLAN.allowedNextRoles).toEqual([
      "employe",
      "direction",
    ]);
    expect(HORORA_ROLE_WRITER_STAGING_PREFLIGHT).toMatchObject({
      readOnly: true,
      roleWrites: 0,
      migrationAppliedByThisChange: false,
      actorAttested: false,
      targetAttested: false,
      anonRpcVisible: false,
    });
    expect(HORORA_ISOLATED_PREVIEW_CANDIDATE.deployed).toBe(false);
    expect(HORORA_ISOLATED_PREVIEW_CANDIDATE.published).toBe(false);
    expect(HORORA_ISOLATED_PREVIEW_CANDIDATE.requiredCommits).toContain(
      HORORA_ISOLATED_PREVIEW_CANDIDATE.includesHttpGuards
    );
    expect(HORORA_ISOLATED_PREVIEW_CANDIDATE.requiredCommits).toContain(
      HORORA_ISOLATED_PREVIEW_CANDIDATE.includesRoleWriter
    );
    expect(HORORA_ISOLATED_PREVIEW_CANDIDATE.requiredCommits).not.toContain(
      HORORA_ISOLATED_PREVIEW_CANDIDATE.excludedCommit
    );
    expect(HORORA_ISOLATED_PREVIEW_CANDIDATE.sourceTip).toBe(
      "5731922e082688580dedc9b2e2edbc104cc5baaf"
    );
    expect(HORORA_ISOLATED_PREVIEW_CANDIDATE.conflictResolvedBy).toBe(
      "branch_tip_files_on_production_base"
    );
    expect(HORORA_ROLE_WRITER_ISOLATED_DELIVERY.publishBranch).toBe(false);
    expect(HORORA_ROLE_WRITER_ISOLATED_DELIVERY.localCommitsAheadOfProductionBeforeThisChange).toBe(
      8
    );
  });

  it("calls the installed function with the same argument names", () => {
    const caller = readFileSync(
      join(process.cwd(), "src/app/lib/employee-onboarding-tenant.server.ts"),
      "utf8"
    );
    for (const name of HORORA_STAGING_ROLE_RPC_ARGS) {
      expect(caller).toContain(`${name}:`);
    }
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261010223000_commit_horora_membership_role_with_audit.sql"
      ),
      "utf8"
    );
    expect(sql).toContain("grant execute on function public.commit_horora_membership_role_with_audit");
    expect(sql).toContain("to service_role");
    expect(sql).not.toContain("grant execute on function public.commit_horora_membership_role_with_audit(uuid, uuid, uuid, text, boolean, bigint, text, text) to authenticated");
    expect(sql).not.toContain("grant execute on function public.commit_horora_membership_role_with_audit(uuid, uuid, uuid, text, boolean, bigint, text, text) to anon");
  });
});
