import { describe, expect, it } from "vitest";
import {
  isMappingStoreUnavailableError,
  sanitizeMappingStoreError,
} from "@/app/lib/auth/nexus-callback-logging.shared";
import {
  NEXUS_STAGING_PORTAL_MODULES_URL,
  publicNexusCallbackDenyReason,
  resolveNexusDeniedReturnUrl,
  resolveNexusPortalReturnUrl,
} from "@/app/lib/auth/nexus-handoff-config";

describe("Nexus callback logging and deny UX", () => {
  it("classifies missing map tables without leaking query text", () => {
    expect(
      sanitizeMappingStoreError(
        new Error('relation "public.horora_nexus_identity_map" does not exist')
      )
    ).toBe("identity_map_table_missing");
    expect(
      isMappingStoreUnavailableError(
        new Error('relation "public.horora_nexus_identity_map" does not exist')
      )
    ).toBe(true);
  });

  it("classifies a mapping HTTP status without the response body", () => {
    expect(sanitizeMappingStoreError(new Error("mapping_http_401"))).toBe("mapping_http_401");
    expect(
      sanitizeMappingStoreError(
        new Error(
          "Forbidden use of secret API key in browser sb_secret_should_not_leak"
        )
      )
    ).toBe("mapping_http_401");
    expect(isMappingStoreUnavailableError(new Error("mapping_http_401"))).toBe(true);
    expect(sanitizeMappingStoreError(new Error("mapping_runtime_error"))).toBe(
      "mapping_runtime_error"
    );
    expect(sanitizeMappingStoreError(new Error("unexpected mapper failure"))).toBe(
      "mapping_store_error"
    );
    expect(sanitizeMappingStoreError(new Error("unexpected mapper failure"))).not.toBe(
      "mapping_transport_error"
    );
  });

  it("classifies permission denied without leaking the query", () => {
    expect(
      sanitizeMappingStoreError(
        new Error("permission denied for table horora_nexus_identity_map")
      )
    ).toBe("mapping_permission_denied");
  });

  it("classifies Production host refusal without leaking the URL", () => {
    expect(
      sanitizeMappingStoreError(
        new Error("Production HORORA refused unknown Supabase host")
      )
    ).toBe("supabase_host_not_production");
    expect(
      isMappingStoreUnavailableError(
        new Error("Production HORORA refused unknown Supabase host")
      )
    ).toBe(true);
  });

  it("maps mapping_unavailable to a distinct public deny reason", () => {
    expect(publicNexusCallbackDenyReason("mapping_unavailable")).toBe(
      "mapping_unavailable"
    );
  });

  it("resolves the denied return from the Vercel project, not a supplied portal URL", () => {
    expect(
      resolveNexusDeniedReturnUrl({
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_URL: "tagora-time-staging-example.vercel.app",
        NEXUS_PORTAL_RETURN_URL: "https://app.tagora.ca/modules",
      })
    ).toBe(NEXUS_STAGING_PORTAL_MODULES_URL);
    expect(resolveNexusDeniedReturnUrl({})).toBeNull();
    expect(resolveNexusDeniedReturnUrl({ VERCEL_ENV: "production" })).toBeNull();
    expect(
      resolveNexusDeniedReturnUrl({
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_URL: "tagora-time-example.vercel.app",
        NEXUS_PORTAL_RETURN_URL: "https://tagora-nexus-staging.vercel.app/modules",
      })
    ).toBe("https://app.tagora.ca/modules");
    expect(
      resolveNexusPortalReturnUrl({
        NEXUS_PORTAL_RETURN_URL: "https://tagora-nexus-staging.vercel.app/modules",
      })
    ).toEqual({
      ok: true,
      url: "https://tagora-nexus-staging.vercel.app/modules",
    });
  });
});
