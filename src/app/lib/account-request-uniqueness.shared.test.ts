import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPANY_SCOPE_RULE,
  accountRequestDuplicateMessageRevealsOtherTenant,
  interpretAccountRequestInsertFailure,
  pendingEmailConflictInScope,
  sameCompanyOpenRequestMessage,
  unscopedAccountRequestInsertBlocked,
} from "@/app/lib/account-request-uniqueness.shared";

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";
const companyA = "33333333-3333-4333-8333-333333333333";
const companyB = "44444444-4444-4444-8444-444444444444";

describe("pending account request uniqueness", () => {
  it("allows the same email in two organizations", () => {
    expect(COMPANY_SCOPE_RULE).toBe("pending_email_unique_per_organization_and_company");
    expect(
      pendingEmailConflictInScope({
        organizationId: orgA,
        organizationCompanyId: companyA,
        email: "Ada@Example.com",
        existingOrganizationId: orgB,
        existingOrganizationCompanyId: companyB,
        existingEmail: "ada@example.com",
        existingStatus: "pending",
      })
    ).toBe(false);
  });

  it("allows the same email in two companies of one organization", () => {
    expect(
      pendingEmailConflictInScope({
        organizationId: orgA,
        organizationCompanyId: companyA,
        email: "ada@example.com",
        existingOrganizationId: orgA,
        existingOrganizationCompanyId: companyB,
        existingEmail: "ada@example.com",
        existingStatus: "pending",
      })
    ).toBe(false);
  });

  it("refuses a duplicate pending email in the same organization and company", () => {
    expect(
      pendingEmailConflictInScope({
        organizationId: orgA,
        organizationCompanyId: companyA,
        email: "ada@example.com",
        existingOrganizationId: orgA,
        existingOrganizationCompanyId: companyA,
        existingEmail: " ADA@example.com ",
        existingStatus: "pending",
      })
    ).toBe(true);
  });

  it("does not treat another status as the unique pending key", () => {
    expect(
      pendingEmailConflictInScope({
        organizationId: orgA,
        organizationCompanyId: companyA,
        email: "ada@example.com",
        existingOrganizationId: orgA,
        existingOrganizationCompanyId: companyA,
        existingEmail: "ada@example.com",
        existingStatus: "refused",
      })
    ).toBe(false);
  });

  it("blocks an insert without organization or company scope", () => {
    expect(
      unscopedAccountRequestInsertBlocked({
        organizationId: null,
        organizationCompanyId: companyA,
      })
    ).toBe(true);
    expect(
      unscopedAccountRequestInsertBlocked({
        organizationId: orgA,
        organizationCompanyId: null,
      })
    ).toBe(true);
    expect(
      unscopedAccountRequestInsertBlocked({
        organizationId: orgA,
        organizationCompanyId: companyA,
      })
    ).toBe(false);
  });

  it("keeps a legacy unscoped row from conflicting or being disclosed", () => {
    expect(
      pendingEmailConflictInScope({
        organizationId: orgA,
        organizationCompanyId: companyA,
        email: "ada@example.com",
        existingOrganizationId: null,
        existingOrganizationCompanyId: null,
        existingEmail: "ada@example.com",
        existingStatus: "pending",
      })
    ).toBe(false);
  });

  it("returns a same-scope error that does not reveal another tenant", () => {
    const duplicate = interpretAccountRequestInsertFailure({
      code: "23505",
      message: "duplicate key value violates unique constraint uq_account_requests_pending_email_tenant_company",
    });
    const unscoped = interpretAccountRequestInsertFailure({
      code: "23514",
      message: "account_request_scope_required",
    });
    expect(duplicate?.status).toBe(409);
    expect(unscoped?.code).toBe("account_request_scope_required");
    expect(accountRequestDuplicateMessageRevealsOtherTenant(duplicate?.error ?? "")).toBe(false);
    expect(accountRequestDuplicateMessageRevealsOtherTenant(sameCompanyOpenRequestMessage("pending"))).toBe(
      false
    );
    expect(accountRequestDuplicateMessageRevealsOtherTenant(unscoped?.error ?? "")).toBe(false);
  });
});

describe("pending account request uniqueness migration", () => {
  it("replaces the global email index without deleting rows", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260927162840_account_request_pending_email_tenant_unique.sql"
      ),
      "utf8"
    );
    const lower = sql.toLowerCase();
    expect(sql).toContain("drop index if exists public.uq_account_requests_pending_email");
    expect(sql).toContain("uq_account_requests_pending_email_tenant_company");
    expect(sql).toContain("organization_id, organization_company_id, lower(email)");
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain("account_request_scope_required");
    expect(sql).toContain("security invoker");
    expect(lower).not.toContain("security definer");
    expect(lower).not.toContain("delete from");
    expect(lower).not.toContain("truncate");
    expect(lower).toContain("legacy rows");
    expect(sql).toContain("lock_timeout");
  });

  it("keeps the create route from confirming an email outside the target company", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/account-requests/route.ts"),
      "utf8"
    );
    expect(route).toContain("userHasMembershipInOrganization");
    expect(route).toContain('.eq("organization_company_id", writeScope.organizationCompanyId)');
    expect(route).toContain("interpretAccountRequestInsertFailure");
    expect(route).not.toContain("uq_account_requests_pending_email\"");
  });
});
