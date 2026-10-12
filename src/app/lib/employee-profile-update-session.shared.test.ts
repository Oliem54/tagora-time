import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hororaNexusSessionRequestInit } from "@/app/lib/auth/horora-nexus-session.client";

function source(path: string) {
  return readFileSync(resolve(path), "utf8");
}

describe("employee profile update session", () => {
  it("sends the fiche update on the Nexus session cookie and not a browser bearer", () => {
    const init = hororaNexusSessionRequestInit({
      method: "PATCH",
      headers: {
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const client = source(
      "src/app/direction/ressources/employes/EmployeeProfilePageClient.tsx"
    );
    let marker = -1;
    let cursor = 0;
    while (cursor < client.length) {
      const next = client.indexOf('method: "PATCH"', cursor);
      if (next === -1) break;
      const before = client.slice(Math.max(0, next - 180), next);
      if (before.includes("hororaNexusSessionRequestInit")) {
        marker = next;
        break;
      }
      cursor = next + 1;
    }
    expect(marker).toBeGreaterThan(-1);
    const update = client.slice(Math.max(0, marker - 250), marker + 500);
    const route = source("src/app/api/direction/ressources/employes/[id]/route.ts");
    const patch = route.slice(route.indexOf("export async function PATCH"));

    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(update).toContain("hororaNexusSessionRequestInit(");
    expect(update).toContain("redirectToNexusLoginIfUnauthenticated(response.status)");
    expect(update).not.toContain("access_token");
    expect(update).not.toContain("supabase.auth.getSession");
    expect(update).not.toContain("Session expirée");
    expect(patch).toContain("getAuthenticatedRequestUser(req)");
    expect(patch).toContain('role !== "direction" && role !== "admin"');
    expect(patch).toContain('jsonError(401, "Non authentifié.")');
    expect(patch).toContain('jsonError(403, "Accès refusé.")');
  });

  it("keeps the invitation on the Nexus session cookie and the existing server guards", () => {
    const client = source(
      "src/app/direction/ressources/employes/EmployeePortalAccessSection.tsx"
    );
    const invite = client.slice(
      client.indexOf("async function postInvite"),
      client.indexOf("async function postSecurityAction")
    );
    const route = source(
      "src/app/api/direction/ressources/employes/[id]/invite-account/route.ts"
    );

    expect(invite).toContain("/invite-account");
    expect(invite).toContain("hororaNexusSessionRequestInit(");
    expect(invite).toContain("redirectToNexusLoginIfUnauthenticated(res.status)");
    expect(invite).not.toContain("supabase.auth.getSession");
    expect(invite).not.toContain("access_token");
    expect(route).toContain("getStrictDirectionRequestUser(req)");
    expect(route).toContain("getAuthenticatedRequestUser(req)");
    expect(route).toContain('actorRole !== "direction" && actorRole !== "admin"');
    expect(route).toContain("Membership organisation active requise.");
    expect(route).toContain("Ajoutez un courriel valide sur la fiche employe avant d inviter.");
  });
});
