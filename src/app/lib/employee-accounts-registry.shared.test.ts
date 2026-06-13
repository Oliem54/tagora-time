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

  it("classifies refused account request into archived instead of orphan", () => {
    const entry = buildRegistryEntryFromParts({
      registryKey: "request:refused-1",
      displayName: "Refusé Test",
      email: "refuse@example.com",
      chauffeur: {
        id: 42,
        nom: "Refusé Test",
        courriel: "refuse@example.com",
        telephone: null,
        actif: true,
        auth_user_id: null,
      },
      authUser: null,
      accountRequest: {
        id: "refused-1",
        full_name: "Refusé Test",
        email: "refuse@example.com",
        phone: null,
        company: "oliem_solutions",
        portal_source: "employe",
        requested_role: "employe",
        requested_permissions: [],
        message: null,
        status: "refused",
        assigned_role: null,
        assigned_permissions: [],
        review_note: "Non retenu",
        reviewed_by: null,
        reviewed_at: "2026-01-02T00:00:00.000Z",
        invited_user_id: null,
        review_lock_token: null,
        review_started_at: null,
        last_error: null,
        audit_log: [],
        created_at: "2026-01-01T00:00:00.000Z",
      },
      authUserFoundForProfile: false,
    });

    expect(matchesRegistryTab(entry, "archived")).toBe(true);
    expect(matchesRegistryTab(entry, "orphan")).toBe(false);
    expect(entry.derivedStatus).toBe("Refusé");
  });

  it("detects stale chauffeur metadata and avoids healthy active classification", () => {
    const entry = buildRegistryEntryFromParts({
      registryKey: "auth:stale-meta",
      displayName: "Stale Meta",
      email: "stale@example.com",
      chauffeur: null,
      authUser: {
        id: "auth-stale",
        email: "stale@example.com",
        app_metadata: { role: "employe", chauffeur_id: 999 },
        user_metadata: {},
        aud: "authenticated",
        created_at: "",
      },
      accountRequest: null,
      authUserFoundForProfile: false,
    });

    expect(entry.diagnostic.staleChauffeurMetadata).toBe(true);
    expect(entry.authLinked).toBe(false);
    expect(entry.derivedStatus).toBe("Metadata chauffeur obsolète");
    expect(matchesRegistryTab(entry, "orphan")).toBe(true);
    expect(matchesRegistryTab(entry, "active")).toBe(false);
    expect(entry.conflictIndicators.some((item) => item.includes("chauffeur_id obsolète"))).toBe(
      true
    );
  });
});
