import { describe, expect, it } from "vitest";
import {
  buildEmployeeAccountsRegistryDiagnostic,
  buildRegistryEntryFromParts,
  deriveRegistryTabs,
  matchesRegistryTab,
} from "@/app/lib/employee-accounts-registry.shared";

describe("employee-accounts-registry.shared", () => {
  it("detects orphan chauffeur without auth_user_id", () => {
    const entry = buildRegistryEntryFromParts({
      registryKey: "employee:9",
      displayName: "Test Employe",
      email: "test@example.com",
      chauffeur: {
        id: 9,
        nom: "Test Employe",
        courriel: "test@example.com",
        telephone: "5145550100",
        actif: true,
        auth_user_id: null,
      },
      authUser: null,
      accountRequest: null,
      authUserFoundForProfile: false,
    });

    expect(entry.diagnostic.chauffeurWithoutAuthUser).toBe(true);
    expect(matchesRegistryTab(entry, "orphan")).toBe(true);
  });

  it("classifies active portal account with active request", () => {
    const diagnostic = buildEmployeeAccountsRegistryDiagnostic({
      chauffeur: {
        id: 1,
        nom: "Actif",
        courriel: "actif@example.com",
        telephone: "5145550101",
        actif: true,
        auth_user_id: "auth-1",
      },
      authUser: {
        id: "auth-1",
        email: "actif@example.com",
        app_metadata: { role: "employe" },
        user_metadata: {},
        aud: "authenticated",
        created_at: "",
      },
      accountRequest: {
        id: "req-1",
        full_name: "Actif",
        email: "actif@example.com",
        phone: null,
        company: "oliem_solutions",
        portal_source: "employe",
        requested_role: "employe",
        requested_permissions: [],
        message: null,
        status: "active",
        assigned_role: "employe",
        assigned_permissions: [],
        review_note: null,
        reviewed_by: null,
        reviewed_at: null,
        invited_user_id: "auth-1",
        review_lock_token: null,
        review_started_at: null,
        last_error: null,
        audit_log: [],
        created_at: "2026-01-01T00:00:00.000Z",
      },
      authUserFoundForProfile: true,
    });

    const tabs = deriveRegistryTabs(diagnostic, {
      authLinked: true,
      hasAccountRequest: true,
    });

    expect(tabs).toContain("active");
    expect(diagnostic.accessDisabled).toBe(false);
  });
});
