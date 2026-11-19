import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261119130000_horora_membership_status_and_permission_audit.sql"
  ),
  "utf8"
);

describe("local membership status and permission SQL", () => {
  it("stays a local preparation and refuses anonymous execution", () => {
    expect(sql).toContain("Do not apply to Staging or Production");
    expect(sql).toContain("NOT_EXECUTED");
    expect(sql).toContain("commit_horora_membership_status_with_audit");
    expect(sql).toContain("commit_horora_permission_override_with_audit");
    expect(sql).toContain("privilege_escalation_forbidden");
    expect(sql).toContain("revoke all on function public.commit_horora_membership_status_with_audit");
    expect(sql).toContain("from anon");
    expect(sql).toContain("from authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).not.toContain("grant execute on function public.commit_horora_membership_status_with_audit(uuid, uuid, uuid, text, text) to anon");
    expect(sql).not.toContain("grant execute on function public.commit_horora_membership_status_with_audit(uuid, uuid, uuid, text, text) to authenticated");
    expect(sql).toContain("enable row level security");
  });

  it("checks department writes before insert and punch denial after an override", () => {
    const departments = readFileSync(
      join(process.cwd(), "src/app/api/direction/effectifs/departments/route.ts"),
      "utf8"
    );
    expect(departments.indexOf("decideHororaDepartmentAdministration")).toBeLessThan(
      departments.indexOf(".insert(")
    );
    const punch = readFileSync(
      join(process.cwd(), "src/app/api/horodateur/_shared.ts"),
      "utf8"
    );
    expect(punch).toContain("accessRemainsAfterOverride");
    expect(punch).toContain("readExplicitCapabilityOverride");
  });
});
