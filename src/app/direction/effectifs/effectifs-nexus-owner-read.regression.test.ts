import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

function sliceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThan(-1);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("Effectifs read for a Nexus Owner session", () => {
  it("loads coverage from the Nexus cookie without a Supabase browser JWT", () => {
    const page = read("src/app/direction/effectifs/DirectionEffectifsClient.tsx");
    const load = sliceBetween(page, "const loadEffectifs", "const loadLivePresence");
    const api = read("src/app/api/direction/effectifs/route.ts");
    const auth = read("src/app/lib/account-requests.server.ts");

    expect(load).toContain("hororaNexusSessionRequestInit()");
    expect(load).toContain("redirectToNexusLoginIfUnauthenticated(res.status)");
    expect(load).toContain("/api/direction/effectifs?company=");
    expect(load).not.toContain("supabase.auth.getSession");
    expect(load).not.toContain("Authorization");
    expect(load).not.toContain("Session expirée. Reconnectez-vous.");
    expect(page).not.toContain("loading || !payload");
    expect(page).toContain("{loading ? (");
    expect(page).toContain("{payload ? (");

    expect(api).toContain("getAuthenticatedRequestUser(req)");
    expect(api).toContain('error: "Non authentifié."');
    expect(api).toContain("{ status: 401 }");
    expect(api).toContain('role === "direction" || role === "admin"');
    expect(auth).toContain("resolveBrokeredHororaSessionFromCookies");
  });
});
