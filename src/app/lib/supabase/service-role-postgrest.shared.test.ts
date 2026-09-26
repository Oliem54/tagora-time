import { describe, expect, it } from "vitest";
import {
  HORORA_MAPPING_USER_AGENT,
  buildHororaServiceRoleHeaders,
  modeledPostgrestRole,
} from "@/app/lib/supabase/service-role-postgrest.shared";

function unsignedJwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url"
  );
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("HORORA service_role PostgREST headers", () => {
  it("sends sb_secret on apikey only so the modeled role is service_role", () => {
    const headers = buildHororaServiceRoleHeaders("sb_secret_test");
    expect(headers.get("apikey")).toBe("sb_secret_test");
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.get("User-Agent")).toBe(HORORA_MAPPING_USER_AGENT);
    expect(modeledPostgrestRole(headers)).toBe("service_role");
  });

  it("does not let a Bearer sb_secret or a browser User-Agent stay on anon", () => {
    const supabaseJsHeaders = new Headers({
      apikey: "sb_secret_test",
      Authorization: "Bearer sb_secret_test",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
    });
    expect(modeledPostgrestRole(supabaseJsHeaders)).toBe("anon");

    const browserSecret = buildHororaServiceRoleHeaders("sb_secret_test");
    browserSecret.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );
    expect(modeledPostgrestRole(browserSecret)).toBe("rejected");
  });

  it("keeps anon and publishable keys off the mapping client", () => {
    expect(() => buildHororaServiceRoleHeaders(unsignedJwt("anon"))).toThrow(
      /cannot assume service_role/
    );
    expect(() => buildHororaServiceRoleHeaders("sb_publishable_test")).toThrow(
      /cannot assume service_role/
    );
    const anonHeaders = new Headers({
      apikey: "sb_publishable_test",
      "User-Agent": HORORA_MAPPING_USER_AGENT,
    });
    expect(modeledPostgrestRole(anonHeaders)).toBe("anon");
  });

  it("still sends a legacy service_role JWT on Authorization", () => {
    const jwt = unsignedJwt("service_role");
    const headers = buildHororaServiceRoleHeaders(jwt);
    expect(headers.get("Authorization")).toBe(`Bearer ${jwt}`);
    expect(modeledPostgrestRole(headers)).toBe("service_role");
  });
});
