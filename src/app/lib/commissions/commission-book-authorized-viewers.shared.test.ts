import { describe, expect, it } from "vitest";
import type { AccountAccessRequestRecord } from "@/app/lib/account-access";
import {
  AUTHORIZED_VIEWER_VALIDATION_ERROR,
  buildAuthorizedViewerOptions,
  buildAuthorizedViewerSelectLabel,
  isAuthorizedBookViewerRole,
  validateAuthorizedViewerAuthUser,
} from "./commission-book-authorized-viewers.shared";

function requestFixture(
  overrides: Partial<AccountAccessRequestRecord> & Pick<AccountAccessRequestRecord, "id">
): AccountAccessRequestRecord {
  return {
    full_name: "Test User",
    email: "test@example.com",
    phone: null,
    company: "oliem_solutions",
    portal_source: "direction",
    requested_role: "direction",
    requested_permissions: null,
    message: null,
    status: "active",
    assigned_role: null,
    assigned_permissions: null,
    review_note: null,
    reviewed_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildAuthorizedViewerOptions", () => {
  it("includes admin and direction viewers", () => {
    const options = buildAuthorizedViewerOptions([
      requestFixture({
        id: "admin-1",
        full_name: "Martin ST-Gelais",
        email: "mstgelais@oliem.ca",
        assigned_role: "admin",
        existing_account: {
          exists: true,
          userId: "admin-user-id",
          chauffeurId: 9,
          role: "admin",
          permissions: ["commissions", "admin_finance"],
          company: "oliem_solutions",
          primaryCompany: "oliem_solutions",
          allowedCompanies: ["oliem_solutions"],
          companyDirectoryContext: "repertoire_oliem_solutions",
          emailConfirmed: true,
          hasSignedIn: true,
          lastSignInAt: null,
          accessDisabled: false,
        },
      }),
      requestFixture({
        id: "dir-1",
        full_name: "Émile Cloutier",
        email: "ecloutier@oliem.ca",
        assigned_role: "direction",
        existing_account: {
          exists: true,
          userId: "direction-user-id",
          chauffeurId: 17,
          role: "direction",
          permissions: ["commissions"],
          company: "oliem_solutions",
          primaryCompany: "oliem_solutions",
          allowedCompanies: ["oliem_solutions"],
          companyDirectoryContext: "repertoire_oliem_solutions",
          emailConfirmed: true,
          hasSignedIn: true,
          lastSignInAt: null,
          accessDisabled: false,
        },
      }),
    ]);

    expect(options).toHaveLength(2);
    expect(options.map((item) => item.role).sort()).toEqual(["admin", "direction"]);
    expect(options.find((item) => item.role === "admin")?.label).toContain("Martin ST-Gelais");
    expect(options.find((item) => item.role === "admin")?.label).toContain("Admin");
    expect(options.find((item) => item.role === "direction")?.label).toContain(
      "Direction · Commissions"
    );
  });

  it("excludes employe viewers and disabled accounts", () => {
    const options = buildAuthorizedViewerOptions([
      requestFixture({
        id: "emp-1",
        assigned_role: "employe",
        existing_account: {
          exists: true,
          userId: "employe-user-id",
          chauffeurId: 21,
          role: "employe",
          permissions: [],
          company: "oliem_solutions",
          primaryCompany: "oliem_solutions",
          allowedCompanies: ["oliem_solutions"],
          companyDirectoryContext: "repertoire_oliem_solutions",
          emailConfirmed: true,
          hasSignedIn: true,
          lastSignInAt: null,
          accessDisabled: false,
        },
      }),
      requestFixture({
        id: "dir-disabled",
        assigned_role: "direction",
        existing_account: {
          exists: true,
          userId: "disabled-user-id",
          chauffeurId: null,
          role: "direction",
          permissions: ["commissions"],
          company: "oliem_solutions",
          primaryCompany: "oliem_solutions",
          allowedCompanies: ["oliem_solutions"],
          companyDirectoryContext: "repertoire_oliem_solutions",
          emailConfirmed: true,
          hasSignedIn: true,
          lastSignInAt: null,
          accessDisabled: true,
        },
      }),
      requestFixture({
        id: "dir-no-user",
        assigned_role: "direction",
        invited_user_id: null,
        existing_account: null,
      }),
    ]);

    expect(options).toHaveLength(0);
  });
});

describe("buildAuthorizedViewerSelectLabel", () => {
  it("omits undefined segments", () => {
    expect(
      buildAuthorizedViewerSelectLabel({
        fullName: "Vincent Blouin",
        email: "",
        role: "admin",
      })
    ).toBe("Vincent Blouin · Admin");
  });
});

describe("resolveAccountRequestPortalRole priority", () => {
  it("prefers existing_account role over stale assigned_role", () => {
    const options = buildAuthorizedViewerOptions([
      requestFixture({
        id: "stale-direction",
        full_name: "Martin ST-Gelais",
        email: "mstgelais@oliem.ca",
        assigned_role: "direction",
        assigned_permissions: ["commissions"],
        existing_account: {
          exists: true,
          userId: "martin-user-id",
          chauffeurId: 9,
          role: "admin",
          permissions: ["commissions", "admin_finance"],
          company: "oliem_solutions",
          primaryCompany: "oliem_solutions",
          allowedCompanies: ["oliem_solutions"],
          companyDirectoryContext: "repertoire_oliem_solutions",
          emailConfirmed: true,
          hasSignedIn: true,
          lastSignInAt: null,
          accessDisabled: false,
        },
      }),
      requestFixture({
        id: "older-direction-request",
        full_name: "Martin ST-Gelais",
        email: "mstgelais@oliem.ca",
        assigned_role: "direction",
        assigned_permissions: ["commissions"],
        existing_account: {
          exists: true,
          userId: "martin-user-id",
          chauffeurId: 9,
          role: "admin",
          permissions: ["commissions", "admin_finance"],
          company: "oliem_solutions",
          primaryCompany: "oliem_solutions",
          allowedCompanies: ["oliem_solutions"],
          companyDirectoryContext: "repertoire_oliem_solutions",
          emailConfirmed: true,
          hasSignedIn: true,
          lastSignInAt: null,
          accessDisabled: false,
        },
      }),
    ]);

    expect(options).toHaveLength(1);
    expect(options[0]?.role).toBe("admin");
    expect(options[0]?.label).toContain("Admin");
    expect(options[0]?.label).not.toContain("Direction");
  });
});

describe("validateAuthorizedViewerAuthUser", () => {
  it("accepts admin and direction roles", () => {
    expect(
      validateAuthorizedViewerAuthUser({
        id: "1",
        app_metadata: { role: "admin" },
      } as never).ok
    ).toBe(true);
    expect(
      validateAuthorizedViewerAuthUser({
        id: "2",
        app_metadata: { role: "direction" },
      } as never).ok
    ).toBe(true);
  });

  it("refuses employe role", () => {
    const result = validateAuthorizedViewerAuthUser({
      id: "3",
      app_metadata: { role: "employe" },
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(AUTHORIZED_VIEWER_VALIDATION_ERROR);
    }
  });
});

describe("isAuthorizedBookViewerRole", () => {
  it("recognizes only admin and direction", () => {
    expect(isAuthorizedBookViewerRole("admin")).toBe(true);
    expect(isAuthorizedBookViewerRole("direction")).toBe(true);
    expect(isAuthorizedBookViewerRole("employe")).toBe(false);
  });
});
