import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appRoleMatchesArea, mapOrganizationMembershipRoleToAppRole } from "@/app/lib/auth/organization-role-mapping.shared";
import {
  ACCOUNT_REQUESTS_FORBIDDEN_MESSAGE,
  ACCOUNT_REQUESTS_LOAD_ERROR_MESSAGE,
  ACCOUNT_REQUESTS_SERVER_ERROR_MESSAGE,
  ACCOUNT_REQUESTS_TIMEOUT_MESSAGE,
  accountRequestsBrowserInit,
  interpretAccountRequestsPageLoad,
  isAccountRequestsViewerAllowed,
  loadAccountRequestsPage,
  shouldKeepAccountRequestsPageLoading,
} from "./account-requests-page-load.shared";

const root = process.cwd();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("account requests page load", () => {
  it("loads through the Nexus cookie without a Supabase access token", () => {
    const init = accountRequestsBrowserInit({
      method: "GET",
      headers: { Authorization: "Bearer should-not-be-sent" },
    });
    const headers = new Headers(init.headers);

    expect(init.credentials).toBe("same-origin");
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("x-account-requests-client")).toBe("browser-authenticated");
    expect(shouldKeepAccountRequestsPageLoading("settled")).toBe(false);
  });

  it("returns the list on success and releases loading", async () => {
    const result = await loadAccountRequestsPage({
      fetchImpl: async () => jsonResponse({ requests: [{ id: "req-1" }] }),
    });

    expect(result.loading).toBe(false);
    expect(result.errorMessage).toBeNull();
    expect(result.requests).toEqual([{ id: "req-1" }]);
    expect(interpretAccountRequestsPageLoad(200, { requests: [{ id: "req-1" }] })).toEqual({
      ok: true,
      requests: [{ id: "req-1" }],
    });
  });

  it("treats an empty list as a finished success", async () => {
    const result = await loadAccountRequestsPage({
      fetchImpl: async () => jsonResponse({ requests: [] }),
    });

    expect(result).toMatchObject({
      requests: [],
      loading: false,
      errorMessage: null,
      denied: false,
      timedOut: false,
    });
  });

  it("allows a Nexus owner or admin to open the direction page", () => {
    const owner = mapOrganizationMembershipRoleToAppRole("organization_owner");
    const admin = mapOrganizationMembershipRoleToAppRole("organization_admin");

    expect(owner).toBe("admin");
    expect(admin).toBe("admin");
    expect(isAccountRequestsViewerAllowed(owner)).toBe(true);
    expect(isAccountRequestsViewerAllowed(admin)).toBe(true);
    expect(appRoleMatchesArea("direction", owner!)).toBe(true);
    expect(appRoleMatchesArea("direction", admin!)).toBe(true);
  });

  it("denies an employee and releases loading", async () => {
    expect(isAccountRequestsViewerAllowed("employe")).toBe(false);
    expect(appRoleMatchesArea("direction", "employe")).toBe(false);

    const result = await loadAccountRequestsPage({
      fetchImpl: async () => jsonResponse({ error: "Acces refuse." }, 403),
    });

    expect(result.loading).toBe(false);
    expect(result.denied).toBe(true);
    expect(result.errorMessage).toBe(ACCOUNT_REQUESTS_FORBIDDEN_MESSAGE);
  });

  it("shows a retryable server error and releases loading", async () => {
    const result = await loadAccountRequestsPage({
      fetchImpl: async () => jsonResponse({ error: "database unavailable" }, 500),
    });

    expect(result.loading).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.errorMessage).toBe(ACCOUNT_REQUESTS_SERVER_ERROR_MESSAGE);
    expect(interpretAccountRequestsPageLoad(500, { error: "database unavailable" }).ok).toBe(false);
  });

  it("releases loading when the request times out", async () => {
    const result = await loadAccountRequestsPage({
      timeoutMs: 20,
      fetchImpl: () => new Promise<Response>(() => undefined),
    });

    expect(result.loading).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.errorMessage).toBe(ACCOUNT_REQUESTS_TIMEOUT_MESSAGE);
  });

  it("releases loading when the request fails", async () => {
    const result = await loadAccountRequestsPage({
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });

    expect(result.loading).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.errorMessage).toBe(ACCOUNT_REQUESTS_LOAD_ERROR_MESSAGE);
  });

  it("wires the page to a finished load, a retry action, and the mobile list", () => {
    const client = readFileSync(
      join(root, "src/app/direction/demandes-comptes/DirectionEmployeeAccountsClient.tsx"),
      "utf8"
    );
    const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
    const gate = readFileSync(join(root, "src/app/components/AuthGate.tsx"), "utf8");

    expect(client).toContain("loadAccountRequestsPage");
    expect(client).toContain("accountRequestsBrowserInit");
    expect(client).toContain("Réessayer");
    expect(client).toContain("AccountRequestMobileCard");
    expect(client).toContain("setLoading(false)");
    expect(client).not.toContain("supabase.auth.getSession");
    expect(client).not.toContain("Authorization");
    expect(css).toContain(".account-requests-mobile-list");
    expect(css).toContain("@media (max-width: 900px)");
    expect(gate).toContain('source === "nexus_handoff"');
    expect(gate).toContain("Réessayer");
    expect(gate).toContain("isSessionContextTimeoutError");
  });
});
